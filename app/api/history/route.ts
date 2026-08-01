// app/api/history/route.ts — Optimization & Roast history (Pro+ feature)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  logger.apiRequest('GET', '/api/history');

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', user.id)
      .single();

    const tier = profile?.tier || 'free';

    // Determine history retention based on tier
    const historyMonths = tier === 'power' ? 6 : tier === 'pro' ? 3 : 1;
    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - historyMonths);

    // Fetch optimizations
    const { data: optimizations } = await supabase
      .from('optimizations')
      .select('id, scores_before, scores_after, keyword_gaps, job_description, created_at, share_token')
      .eq('user_id', user.id)
      .gte('created_at', sinceDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    // Fetch roasts
    const { data: roasts } = await supabase
      .from('roasts')
      .select('id, roast_json, file_url, share_token, created_at')
      .eq('user_id', user.id)
      .gte('created_at', sinceDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    const items = [
      ...(optimizations || []).map(o => ({
        id: o.id,
        type: 'optimize' as const,
        originalScore: o.scores_before,
        optimizedScore: o.scores_after,
        score: null,
        keywordGapCount: (o.keyword_gaps as any[])?.length || 0,
        jobTitle: o.job_description?.split('\n')[0]?.slice(0, 60) || null,
        company: null,
        createdAt: o.created_at,
        shareToken: o.share_token,
        previewSnippet: o.job_description?.slice(0, 100) || '',
      })),
      ...(roasts || []).map(r => ({
        id: r.id,
        type: 'roast' as const,
        originalScore: null,
        optimizedScore: null,
        score: (r.roast_json as any)?.score || null,
        keywordGapCount: null,
        jobTitle: null,
        company: null,
        createdAt: r.created_at,
        shareToken: r.share_token,
        previewSnippet: '',
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    logger.apiResponse('GET', '/api/history', 200, Date.now() - startTime, { userId: user.id, count: items.length });
    return NextResponse.json({
      items,
      total: items.length,
      tier,
    });

  } catch (e: any) {
    logger.apiError('GET', '/api/history', e);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
