import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      env.supabaseUrl, env.supabaseAnonKey,
      { cookies: { get(name) { return cookieStore.get(name)?.value; }, set(name, v, o) { cookieStore.set({ name, value: v, ...o }); }, remove(name, o) { cookieStore.delete({ name, ...o }); } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Team name required' }, { status: 400 });

    const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
    const { data: teamId } = await adminClient.rpc('create_team', { team_name: name.trim(), admin_user_id: user.id });

    logger.apiResponse('POST', '/api/team/create', 200, Date.now() - startTime, { teamId });
    return NextResponse.json({ teamId });
  } catch (e: any) {
    logger.apiError('POST', '/api/team/create', e);
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
  }
}
