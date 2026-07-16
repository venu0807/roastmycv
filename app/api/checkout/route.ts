// app/api/checkout/route.ts — Payment checkout with Stripe (global) + Razorpay (India)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getRazorpay, NEXT_PUBLIC_RAZORPAY_KEY_ID } from '@/lib/razorpay';
import { getStripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const PLANS = {
  pro_monthly: {
    india: (userId: string) => ({ amount: 29900, currency: 'INR', planId: process.env.RAZORPAY_PLAN_ROAST_PRO, notes: { userId }, receipt: `pro_${userId}_${Date.now()}` }),
    global: { amount: 499, currency: 'USD', priceId: process.env.STRIPE_PRICE_ROAST_PRO },
  },
  lifetime: {
    india: (userId: string) => ({ amount: 149900, currency: 'INR', notes: { userId, tier: 'lifetime' }, receipt: `lifetime_${userId}_${Date.now()}` }),
    global: { amount: 1900, currency: 'USD', priceId: process.env.STRIPE_PRICE_ROAST_LIFETIME },
  },
};

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  logger.apiRequest('POST', '/api/checkout');

  const cookieStore = await cookies();
  const supabase = createServerClient(
    env.supabaseUrl,
    env.supabaseAnonKey,
    { cookies: { get(name) { return cookieStore.get(name)?.value; }, set(name, value, opts) { cookieStore.set({ name, value, ...opts }); }, remove(name, opts) { cookieStore.delete({ name, ...opts }); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    logger.apiResponse('POST', '/api/checkout', 401, Date.now() - startTime, { error: 'unauthenticated' });
    return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  }

  const { market, plan } = await req.json();
  const product = PLANS[plan as keyof typeof PLANS];
  if (!product) {
    logger.apiResponse('POST', '/api/checkout', 400, Date.now() - startTime, { error: 'invalid_plan', plan });
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (market === 'india') {
    const rp = getRazorpay();
    if (plan === 'lifetime') {
      const opts = product.india(user.id) as any;
      const order = await rp.orders.create({ amount: opts.amount, currency: opts.currency, receipt: opts.receipt, notes: opts.notes });
      logger.apiResponse('POST', '/api/checkout', 200, Date.now() - startTime, { method: 'razorpay', plan, market });
      return NextResponse.json({ method: 'razorpay', orderId: order.id, key: NEXT_PUBLIC_RAZORPAY_KEY_ID, amount: opts.amount, currency: opts.currency });
    }
    const opts = product.india(user.id) as { amount: number; currency: string; planId?: string; notes: Record<string, string>; receipt: string };
    if (!opts.planId) {
      logger.apiError('POST', '/api/checkout', new Error('Razorpay plan not configured'), { plan });
      return NextResponse.json({ error: 'Razorpay plan not configured. Set RAZORPAY_PLAN_ROAST_PRO' }, { status: 500 });
    }
    const subscription = await rp.subscriptions.create({ plan_id: opts.planId, customer_notify: 1, quantity: 1, total_count: 12, notes: opts.notes });
    logger.apiResponse('POST', '/api/checkout', 200, Date.now() - startTime, { method: 'razorpay', plan, market, subscriptionId: subscription.id });
    return NextResponse.json({ method: 'razorpay', subscriptionId: subscription.id, key: NEXT_PUBLIC_RAZORPAY_KEY_ID });
  }

  // Global — Stripe
  const stripe = getStripe();
  const priceId = product.global.priceId;
  if (!priceId) {
    logger.apiError('POST', '/api/checkout', new Error('Stripe price not configured'), { plan });
    return NextResponse.json({ error: 'Stripe price not configured' }, { status: 500 });
  }
  const session = await stripe.checkout.sessions.create({
    mode: plan === 'lifetime' ? 'payment' : 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email,
    success_url: `${origin}/roast?checkout=success`,
    cancel_url: `${origin}/pricing?cancelled=true`,
  });
  logger.apiResponse('POST', '/api/checkout', 200, Date.now() - startTime, { method: 'stripe', plan, market, sessionId: session.id });
  return NextResponse.json({ method: 'stripe', url: session.url });
}