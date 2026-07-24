import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      env.supabaseUrl, env.supabaseAnonKey,
      { cookies: { get(name) { return cookieStore.get(name)?.value; }, set(name, v, o) { cookieStore.set({ name, value: v, ...o }); }, remove(name, o) { cookieStore.delete({ name, ...o }); } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('team_id, tier')
      .eq('id', user.id)
      .single();

    if (!profile?.team_id) return NextResponse.json({ team: null });

    const [team, members, transactions] = await Promise.all([
      adminClient.from('teams').select('*').eq('id', profile.team_id).single(),
      adminClient.from('team_members')
        .select('user_id, role, joined_at, profiles!inner(email, full_name, avatar_url)')
        .eq('team_id', profile.team_id),
      adminClient.from('credit_transactions')
        .select('*')
        .eq('team_id', profile.team_id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    return NextResponse.json({
      team: team.data,
      members: members.data || [],
      transactions: transactions.data || [],
    });
  } catch (e: any) {
    logger.apiError('GET', '/api/team/info', e);
    return NextResponse.json({ error: 'Failed to fetch team info' }, { status: 500 });
  }
}
