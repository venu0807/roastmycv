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

    const { teamId, memberEmail, action } = await req.json();
    if (!teamId || !memberEmail || !action) {
      return NextResponse.json({ error: 'teamId, memberEmail, and action required' }, { status: 400 });
    }

    const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

    // Verify requester is admin of the team
    const { data: requester } = await adminClient
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();

    if (!requester || requester.role !== 'admin') {
      return NextResponse.json({ error: 'Only team admins can manage members' }, { status: 403 });
    }

    if (action === 'invite') {
      // Find user by email
      const { data: memberUser } = await adminClient
        .from('profiles')
        .select('id')
        .eq('email', memberEmail)
        .single();

      if (!memberUser) {
        return NextResponse.json({ error: 'User not found. They must sign up first.' }, { status: 404 });
      }

      await adminClient.rpc('add_team_member', {
        team_id: teamId,
        member_user_id: memberUser.id,
        member_role: 'member',
      });

      logger.apiResponse('POST', '/api/team/members', 200, Date.now() - startTime, { action: 'invite', memberEmail });
      return NextResponse.json({ success: true });
    }

    if (action === 'remove') {
      const { data: memberUser } = await adminClient
        .from('profiles')
        .select('id')
        .eq('email', memberEmail)
        .single();

      if (!memberUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      await adminClient.rpc('remove_team_member', {
        team_id: teamId,
        member_user_id: memberUser.id,
      });

      logger.apiResponse('POST', '/api/team/members', 200, Date.now() - startTime, { action: 'remove', memberEmail });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e: any) {
    logger.apiError('POST', '/api/team/members', e);
    return NextResponse.json({ error: 'Failed to manage members' }, { status: 500 });
  }
}

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
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('teamId');

    if (teamId) {
      const { data: members } = await adminClient
        .from('team_members')
        .select('user_id, role, joined_at, profiles!inner(email, full_name, avatar_url)')
        .eq('team_id', teamId);

      return NextResponse.json({ members: members || [] });
    }

    // Get user's team
    const { data: profile } = await adminClient
      .from('profiles')
      .select('team_id')
      .eq('id', user.id)
      .single();

    if (!profile?.team_id) return NextResponse.json({ team: null });

    const { data: team } = await adminClient
      .from('teams')
      .select('*')
      .eq('id', profile.team_id)
      .single();

    const { data: members } = await adminClient
      .from('team_members')
      .select('user_id, role, joined_at, profiles!inner(email, full_name, avatar_url)')
      .eq('team_id', profile.team_id);

    return NextResponse.json({ team, members: members || [] });
  } catch (e: any) {
    logger.apiError('GET', '/api/team/members', e);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}
