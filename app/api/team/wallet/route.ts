import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRazorpay, NEXT_PUBLIC_RAZORPAY_KEY_ID } from '@/lib/razorpay';
import { getStripe } from '@/lib/stripe';
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

    const { teamId, amount, market } = await req.json();
    // amount in INR (e.g. 500, 1000, 2500, 5000)
    if (!teamId || !amount || amount < 500) {
      return NextResponse.json({ error: 'Minimum top-up is ₹500' }, { status: 400 });
    }

    // Verify requester is admin of the team
    const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
    const { data: requester } = await adminClient
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();

    if (!requester || requester.role !== 'admin') {
      return NextResponse.json({ error: 'Only team admins can top up wallet' }, { status: 403 });
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (market === 'india') {
      const rp = getRazorpay();
      const order = await rp.orders.create({
        amount: amount * 100, // INR to paise
        currency: 'INR',
        receipt: `team_${teamId}_${Date.now()}`,
        notes: { userId: user.id, teamId, tier: 'team', receipt: `team_${teamId}_${Date.now()}` },
      });

      logger.apiResponse('POST', '/api/team/wallet', 200, Date.now() - startTime, { method: 'razorpay' });
      return NextResponse.json({
        method: 'razorpay',
        orderId: order.id,
        key: NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: amount * 100,
        currency: 'INR',
      });
    }

    // Global — Stripe
    const stripe = getStripe();
    const usdAmount = Math.round(amount / 83); // rough INR→USD
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `RoastMyCV Team Wallet Top-up` },
          unit_amount: Math.max(usdAmount * 100, 599), // min $5.99
        },
        quantity: 1,
      }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { tier: 'team', teamId, wallet_amount: String(amount) },
      success_url: `${origin}/team?topup=success`,
      cancel_url: `${origin}/team?cancelled=true`,
    });

    logger.apiResponse('POST', '/api/team/wallet', 200, Date.now() - startTime, { method: 'stripe', sessionId: session.id });
    return NextResponse.json({ method: 'stripe', url: session.url });
  } catch (e: any) {
    logger.apiError('POST', '/api/team/wallet', e);
    return NextResponse.json({ error: 'Failed to create top-up' }, { status: 500 });
  }
}
