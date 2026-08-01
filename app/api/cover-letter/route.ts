// app/api/cover-letter/route.ts — Generate tailored cover letter (Pro+ feature)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCoverLetter } from '@/lib/llm';
import { parseResume } from '@/lib/parse-resume';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  logger.apiRequest('POST', '/api/cover-letter');

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, opts) { cookieStore.set({ name, value, ...opts }); },
        remove(name, opts) { cookieStore.delete({ name, ...opts }); },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    // Check access via RPC
    const { data: access } = await supabase.rpc('check_cover_letter_access', { check_user_id: user.id });
    const result = Array.isArray(access) ? access[0] : access;
    if (!result?.can_generate) {
      return NextResponse.json({ error: 'Upgrade to Pro or Power for cover letters', upgrade: true }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('resume') as File;
    const jobDescription = formData.get('jobDescription') as string;
    const tone = (formData.get('tone') as string) || 'professional';

    if (!file || !jobDescription) {
      return NextResponse.json({ error: 'Missing resume or job description' }, { status: 400 });
    }

    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Invalid file (max 5MB, PDF/DOCX)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const resumeData = await parseResume(buffer, file.type);

    const coverLetter = await generateCoverLetter(resumeData, jobDescription, tone);

    await supabase.rpc('increment_cover_letter_count', { inc_user_id: user.id });

    logger.apiResponse('POST', '/api/cover-letter', 200, Date.now() - startTime, { userId: user.id });
    return NextResponse.json({
      coverLetter,
      remaining: result.remaining,
      tier: result.tier,
    });

  } catch (e: any) {
    logger.apiError('POST', '/api/cover-letter', e);
    return NextResponse.json({ error: 'Cover letter generation failed' }, { status: 500 });
  }
}
