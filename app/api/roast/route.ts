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

    // Auth-optional: check if user is signed in, but don't block anonymous
    const { data: { user } } = await supabase.auth.getUser();
    const isAuthenticated = !!user;

    // Determine rate limit tier
    let maxRequests = 5;
    let tier = 'free';
    let profile: { tier: string; roasts_today: number; last_roast_date: string; total_roasts: number } | null = null;

    if (isAuthenticated) {
      const { data: p } = await supabase
        .from('profiles')
        .select('tier, roasts_today, last_roast_date, total_roasts')
        .eq('id', user.id)
        .single();

      profile = p;
      tier = profile?.tier || 'free';
      if (tier !== 'free') maxRequests = 30;
    }

    // Distributed rate limit via Upstash Redis (falls back to in-memory)
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const key = `roast:${user?.id || `anon:${ip || 'unknown'}`}`;
    const { allowed, remaining, resetAt } = await checkRateLimit(key, maxRequests);

    if (!allowed) {
      const isFreeUser = !isAuthenticated || tier === 'free';
      const durationMs = Date.now() - startTime;
      logger.apiResponse('POST', '/api/roast', 429, durationMs, { key, remaining, tier });
      return NextResponse.json(
        {
          error: isFreeUser
            ? 'Free trial used (1 roast/day). Sign in for unlimited!'
            : 'Rate limit exceeded. Try again shortly.',
          upgrade: isFreeUser,
          resetAt: new Date(resetAt).toISOString(),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
          },
        }
      );
    }

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

    // Cache check — skip redundant LLM calls for identical resumes
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

    const today = new Date().toISOString().split('T')[0];

    if (isAuthenticated) {
      // Save to DB for signed-in users
      const ext = file.type === 'application/pdf' ? 'pdf' : 'docx';
      const fileName = `roasts/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, buffer, { contentType: file.type, upsert: false });

      if (uploadError) {
        logger.error('Storage upload failed', { userId: user.id, error: uploadError.message });
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
      }

      const roastsToday = profile?.last_roast_date === today ? profile.roasts_today : 0;
      const isFree = tier === 'free';

      // Enforce daily limit for free users (double-check)
      if (isFree && roastsToday >= 1) {
        return NextResponse.json(
          { error: 'Free trial used (1 roast/day). Sign in for unlimited!', upgrade: true },
          { status: 429 }
        );
      }

      const { error: insertError } = await supabase.from('roasts').insert({
        user_id: user.id,
        file_url: fileName,
        resume_json: resumeData,
        roast_json: roastResult,
        is_watermarked: isFree,
        user_tier_at_time: tier,
      }).select().single();

      if (insertError) {
        logger.error('DB insert failed', { userId: user.id, error: insertError.message });
        return NextResponse.json({ error: 'Save failed' }, { status: 500 });
      }

      const durationMs = Date.now() - startTime;
      logger.apiResponse('POST', '/api/roast', 200, durationMs, { userId: user.id, tier, cached: !!cached });
      return NextResponse.json({
        roast: roastResult,
        remainingToday: isFree ? 0 : null,
      });
    }

    // Anonymous — just return result, track via cookie
    const anonRoasts = parseInt(cookieStore.get('anon_roasts')?.value || '0');
    const anonDate = cookieStore.get('anon_roasts_date')?.value;
    const effectiveAnonRoasts = anonDate === today ? anonRoasts : 0;

    const response = NextResponse.json({ roast: roastResult });
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