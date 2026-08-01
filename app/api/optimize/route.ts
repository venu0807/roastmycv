// app/api/optimize/route.ts — ATS Resume Optimization (HireRaft-style)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { optimizeResume } from '@/lib/llm';
import { parseResume } from '@/lib/parse-resume';
import { getCached, setCache, cacheKey } from '@/lib/cache';
import { checkRateLimit, getRateLimitKey } from '@/lib/cache';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  logger.apiRequest('POST', '/api/optimize');

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

    // ── Check optimize access via SQL function ──────────────────────────
    let remaining = -1;
    let tier = 'free';
    let canDownload = false;

    if (isAuthenticated) {
      const { data: access, error: accessError } = await supabase
        .rpc('check_optimize_access', { check_user_id: user.id });

      if (accessError) {
        logger.error('check_optimize_access failed', { userId: user.id, error: accessError.message });
        return NextResponse.json({ error: 'Access check failed' }, { status: 500 });
      }

      const result = Array.isArray(access) ? access[0] : access;
      if (!result?.can_optimize) {
        return NextResponse.json(
          { error: 'Free limit reached (2 optimizations/month). Upgrade Pro for 20/mo!', upgrade: true, remaining: 0 },
          { status: 429 }
        );
      }

      tier = result?.tier || 'free';
      remaining = result?.remaining ?? -1;
      canDownload = result?.can_download ?? false;
    } else {
      // Anonymous — require sign in for optimize
      return NextResponse.json(
        { error: 'Sign in to optimize your resume for ATS' },
        { status: 401 }
      );
    }

    // ── Rate limiting ───────────────────────────────────────────────────
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const rlKey = isAuthenticated ? `optimize:${user.id}` : `optimize:anon:${ip || 'unknown'}`;
    const { allowed: rlAllowed } = await checkRateLimit(rlKey, 10);

    if (!rlAllowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, { status: 429 });
    }

    // ── File validation ─────────────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      return NextResponse.json({ error: 'Invalid form data', _debug: 'formdata_parse_failed' }, { status: 400 });
    }

    const file = formData.get('resume') as File;
    const jobDescription = formData.get('jobDescription') as string;

    if (!file) return NextResponse.json({ error: 'Missing resume file', _debug: 'no_file' }, { status: 400 });
    if (!jobDescription || jobDescription.trim().length < 20) {
      return NextResponse.json({ error: 'Job description too short (min 20 chars)', _debug: 'jd_too_short' }, { status: 400 });
    }

    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Invalid file (max 5MB, PDF or DOCX)', _debug: 'invalid_file_type_or_size' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Parse resume ────────────────────────────────────────────────────
    let resumeData;
    try {
      resumeData = await parseResume(buffer, file.type);
    } catch (e: any) {
      logger.warn('Resume parse error', { error: e.message, fileName: file.name });
      return NextResponse.json({ error: 'Failed to parse resume. Try a simpler PDF/DOCX.', _debug: 'parse_failed:' + e.message }, { status: 400 });
    }

    if (!resumeData?.text || resumeData.text.trim().length < 10) {
      return NextResponse.json({ error: 'Resume text too short after parsing', _debug: 'parsed_text_empty' }, { status: 400 });
    }

    resumeData.text = resumeData.text.slice(0, 6000);
    const jdTrimmed = jobDescription.trim().slice(0, 4000);

    // ── Cache check — skip redundant LLM calls ──────────────────────────
    const cacheK = `optimize:${cacheKey(resumeData.text)}:${cacheKey(jdTrimmed)}`;
    const cached = await getCached(cacheK);
    let optimizeResult: any;

    if (cached) {
      logger.info('Cache hit for optimize', { key: cacheK });
      optimizeResult = cached;
    } else {
      logger.info('Running single-pass ATS optimization');
      try {
        optimizeResult = await optimizeResume(resumeData, jdTrimmed);
        await setCache(cacheK, optimizeResult);
      } catch (e: any) {
        logger.error('LLM optimization failed', { error: e.message, stack: e.stack });
        return NextResponse.json({ error: 'AI optimization failed. Please try again in a moment.', _debug: 'llm_failed:' + e.message }, { status: 503 });
      }
    }

    // Guard: optimizeResult must be defined at this point
    if (!optimizeResult) {
      logger.error('optimizeResult is null after LLM call', { resumeLength: resumeData.text.length, jdLength: jdTrimmed.length });
      return NextResponse.json({ error: 'Optimization produced no result. Try again.', _debug: 'optimizeResult_null' }, { status: 500 });
    }

    // ── Save to DB ──────────────────────────────────────────────────────
    const ext = file.type === 'application/pdf' ? 'pdf' : 'docx';
    const fileName = `optimizations/${user.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      logger.error('Storage upload failed', { userId: user.id, error: uploadError.message });
    }

    try {
      const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
      await adminClient.from('optimizations').insert({
        user_id: user.id,
        file_url: fileName,
        job_description: jdTrimmed,
        original_resume_json: resumeData,
        optimized_resume_json: { text: optimizeResult.optimizedResumeText },
        keyword_gaps: optimizeResult.keywordGaps,
        scores_before: optimizeResult.atsScoreBefore,
        scores_after: optimizeResult.atsScoreAfter,
        changes_summary: optimizeResult.changes,
        job_title: guessJobTitle(jdTrimmed),
      }).select().single();

      await supabase.rpc('increment_optimization_count', { inc_user_id: user.id });
    } catch (dbError: any) {
      logger.error('Optimization DB insert failed', { userId: user.id, error: dbError.message });
      // Still return result even if DB save fails
    }

    const durationMs = Date.now() - startTime;
    logger.apiResponse('POST', '/api/optimize', 200, durationMs, { userId: user.id, tier });

    return NextResponse.json({
      optimizationId: '',
      originalScore: optimizeResult.atsScoreBefore,
      optimizedScore: optimizeResult.atsScoreAfter,
      scoreImprovement: optimizeResult.atsScoreAfter - optimizeResult.atsScoreBefore,
      keywordGaps: optimizeResult.keywordGaps,
      optimizedResume: { text: optimizeResult.optimizedResumeText },
      changes: optimizeResult.changes,
      improvedBullets: optimizeResult.improvedBullets,
      remaining,
      tier,
      canDownload,
    });

  } catch (e: any) {
    const durationMs = Date.now() - startTime;
    const errMsg = e?.message || String(e || 'Unknown error');
    logger.apiError('POST', '/api/optimize', e);
    return NextResponse.json({
      error: 'Optimization failed. Please try again.',
      _debug: 'unhandled_catch:' + errMsg.slice(0, 200),
    }, { status: 500 });
  }
}

function guessJobTitle(jd: string): string {
  const firstLine = jd.split('\n')[0].trim();
  // Try to extract job title from first line
  const titleMatch = firstLine.match(/(?:for|at|–|-)\s*([A-Za-z\s]+)/);
  return titleMatch?.[1]?.trim() || firstLine.slice(0, 60);
}
