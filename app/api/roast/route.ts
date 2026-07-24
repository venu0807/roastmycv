import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { roastResume } from '@/lib/llm';
import { parseResume } from '@/lib/parse-resume';
import { getCached, setCache, cacheKey, checkRateLimit, getRateLimitKey } from '@/lib/cache';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  logger.apiRequest('POST', '/api/roast');

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      env.supabaseUrl,
      env.supabaseAnonKey,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value; },
          set(name, value, options) { cookieStore.set({ name, value, ...options }); },
          remove(name, options) { cookieStore.delete({ name, ...options }); },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    const isAuthenticated = !!user;

    // ── Check access via monthly SQL function ────────────────────────────
    let remaining = -1;
    let tier = 'free';
    let downloadCredits = 0;

    if (isAuthenticated) {
      const { data: access, error: accessError } = await supabase
        .rpc('check_roast_access', { check_user_id: user.id });

      if (accessError) {
        logger.error('check_roast_access failed', { userId: user.id, error: accessError.message });
        return NextResponse.json({ error: 'Access check failed' }, { status: 500 });
      }

      const result = Array.isArray(access) ? access[0] : access;
      if (!result?.can_roast) {
        const durationMs = Date.now() - startTime;
        logger.apiResponse('POST', '/api/roast', 429, durationMs, { userId: user.id, tier: result?.tier, remaining: result?.remaining });
        return NextResponse.json(
          {
            error: 'Free limit reached (5 roasts/month). Upgrade for unlimited!',
            upgrade: true,
            remaining: 0,
            tier: result?.tier || 'free',
          },
          { status: 429 }
        );
      }

      tier = result?.tier || 'free';
      remaining = result?.remaining ?? -1;
      downloadCredits = result?.download_credits ?? 0;
    } else {
      // Anonymous rate limiting via Upstash Redis
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
      const key = `anon:${ip || 'unknown'}`;
      const { allowed, resetAt } = await checkRateLimit(key, 5);

      if (!allowed) {
        return NextResponse.json(
          { error: 'Free trial used (5 roasts). Sign in for more!', upgrade: true, remaining: 0 },
          { status: 429 }
        );
      }
    }

    // ── Distributed rate limit via Upstash Redis (anti-abuse) ────────────
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const rlKey = isAuthenticated ? `roast:${user.id}` : `roast:anon:${ip || 'unknown'}`;
    const { allowed: rlAllowed, remaining: rlRemaining, resetAt } = await checkRateLimit(rlKey, 30);

    if (!rlAllowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again shortly.', remaining: 0 },
        { status: 429 }
      );
    }

    // ── File validation ──────────────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }
    const file = formData.get('resume') as File;

    if (!file) {
      return NextResponse.json({ error: 'Missing resume file' }, { status: 400 });
    }

    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Invalid file (max 5MB, PDF or DOCX)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let resumeData;
    try {
      resumeData = await parseResume(buffer, file.type);
    } catch (e: any) {
      logger.warn('Resume parse error', { error: e.message, fileName: file.name });
      return NextResponse.json({ error: 'Failed to parse resume. Try a simpler PDF/DOCX.' }, { status: 400 });
    }

    // Sanitize resume text
    resumeData.text = resumeData.text.slice(0, 10000);
    for (const k of Object.keys(resumeData.sections)) {
      if (resumeData.sections[k]) resumeData.sections[k] = resumeData.sections[k]!.slice(0, 5000);
    }

    // ── Cache check — skip redundant LLM calls ───────────────────────────
    const cacheK = cacheKey(resumeData.text);
    const cached = await getCached(cacheK);
    let roastResult;
    if (cached) {
      logger.info('Cache hit for roast', { key: cacheK });
      roastResult = cached;
    } else {
      try {
        logger.info('Calling Groq LLM for roast');
        roastResult = await roastResume(resumeData);
        await setCache(cacheK, roastResult);
      } catch (e: any) {
        logger.error('LLM API error', { error: e.message, stack: e.stack });
        return NextResponse.json(
          { error: 'Our AI is currently unavailable. Please try again in a few minutes.' },
          { status: 503 }
        );
      }
    }

    // ── Save to DB + increment usage ────────────────────────────────────
    if (isAuthenticated) {
      const ext = file.type === 'application/pdf' ? 'pdf' : 'docx';
      const fileName = `roasts/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, buffer, { contentType: file.type, upsert: false });

      if (uploadError) {
        logger.error('Storage upload failed', { userId: user.id, error: uploadError.message });
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
      }

      // Mark as watermarked for free/starter, no watermark for paid tiers
      const isWatermarked = tier === 'free' || tier === 'starter';

      const { error: insertError } = await supabase.from('roasts').insert({
        user_id: user.id,
        file_url: fileName,
        resume_json: resumeData,
        roast_json: roastResult,
        is_watermarked: isWatermarked,
        user_tier_at_time: tier,
      }).select().single();

      if (insertError) {
        logger.error('DB insert failed', { userId: user.id, error: insertError.message });
        return NextResponse.json({ error: 'Save failed' }, { status: 500 });
      }

      // Increment monthly usage count (silent — unlimited tiers return -1)
      await supabase.rpc('increment_roast_count', { inc_user_id: user.id });

      const durationMs = Date.now() - startTime;
      logger.apiResponse('POST', '/api/roast', 200, durationMs, { userId: user.id, tier, cached: !!cached });
      return NextResponse.json({
        roast: roastResult,
        remaining,
        tier,
        download_credits: downloadCredits,
        can_download: tier !== 'free' && tier !== 'starter' || downloadCredits > 0,
      });
    }

    // ── Anonymous — just return result, track via cookie ─────────────────
    const today = new Date().toISOString().split('T')[0];
    const anonRoasts = parseInt(cookieStore.get('anon_roasts')?.value || '0');
    const anonDate = cookieStore.get('anon_roasts_date')?.value;
    const effectiveAnonRoasts = anonDate === today ? anonRoasts : 0;

    const response = NextResponse.json({
      roast: roastResult,
      remaining: Math.max(0, 5 - effectiveAnonRoasts - 1),
      tier: 'anon',
      can_download: false,
    });
    response.cookies.set('anon_roasts', String(effectiveAnonRoasts + 1), { maxAge: 86400, path: '/' });
    response.cookies.set('anon_roasts_date', today, { maxAge: 86400, path: '/' });

    const durationMs = Date.now() - startTime;
    logger.apiResponse('POST', '/api/roast', 200, durationMs, { anonymous: true, cached: !!cached });
    return response;

  } catch (e: any) {
    const durationMs = Date.now() - startTime;
    logger.apiError('POST', '/api/roast', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
