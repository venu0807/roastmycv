// app/api/skill-roadmap/route.ts — Generate skill learning roadmap (Pro+ feature)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { generateSkillRoadmap } from '@/lib/llm';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  logger.apiRequest('POST', '/api/skill-roadmap');

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

    const { data: access } = await supabase.rpc('check_skill_roadmap_access', { check_user_id: user.id });
    const result = Array.isArray(access) ? access[0] : access;
    if (!result?.can_access) {
      return NextResponse.json({ error: 'Upgrade to Pro or Power for skill roadmaps', upgrade: true }, { status: 403 });
    }

    const body = await req.json();
    const { skills, targetRole } = body;

    if (!Array.isArray(skills) || skills.length === 0 || !targetRole) {
      return NextResponse.json({ error: 'Skills array and targetRole required' }, { status: 400 });
    }

    const roadmap = await generateSkillRoadmap(skills, targetRole);

    await supabase.rpc('increment_skill_roadmap_count', { inc_user_id: user.id });

    logger.apiResponse('POST', '/api/skill-roadmap', 200, Date.now() - startTime, { userId: user.id, skillCount: skills.length });
    return NextResponse.json({
      skillRoadmap: roadmap,
      remaining: result.remaining,
      tier: result.tier,
    });

  } catch (e: any) {
    logger.apiError('POST', '/api/skill-roadmap', e);
    return NextResponse.json({ error: 'Skill roadmap generation failed' }, { status: 500 });
  }
}
