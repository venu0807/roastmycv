// app/api/checkout/route.ts — Payment checkout with Stripe (global) + Razorpay (India)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getRazorpay, NEXT_PUBLIC_RAZORPAY_KEY_ID } from '@/lib/razorpay';
import { getStripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const PLANS: Record<string, {
  india: (userId: string) => { amount: number; currency: string; planId?: string; notes: Record<string, string>; receipt: string };
  global: { amount: number; currency: string; priceId?: string; metadata: Record<string, string> };
}> = {
  starter: {
    india: (userId: string) => ({
      amount: 9900, currency: 'INR',
      notes: { userId, tier: 'starter', receipt: `starter_${userId}_${Date.now()}` },
      receipt: `starter_${userId}_${Date.now()}`,
    }),
    global: { amount: 199, currency: 'USD', priceId: process.env.STRIPE_PRICE_ROAST_STARTER, metadata: { tier: 'starter' } },
  },
  pro_monthly: {
    india: (userId: string) => ({
      amount: 19900, currency: 'INR',
      planId: process.env.RAZORPAY_PLAN_ROAST_PRO,
      notes: { userId, tier: 'pro', plan_type: 'monthly' },
      receipt: `pro_${userId}_${Date.now()}`,
    }),
    global: { amount: 399, currency: 'USD', priceId: process.env.STRIPE_PRICE_ROAST_PRO, metadata: { tier: 'pro', plan_type: 'monthly' } },
  },
  pro_annual: {
    india: (userId: string) => ({
      amount: 199000, currency: 'INR',
      planId: process.env.RAZORPAY_PLAN_ROAST_PRO_ANNUAL,
      notes: { userId, tier: 'pro', plan_type: 'annual' },
      receipt: `pro_yr_${userId}_${Date.now()}`,
    }),
    global: { amount: 1990, currency: 'USD', priceId: process.env.STRIPE_PRICE_ROAST_PRO_ANNUAL, metadata: { tier: 'pro', plan_type: 'annual' } },
  },
  power_monthly: {
    india: (userId: string) => ({
      amount: 39900, currency: 'INR',
      planId: process.env.RAZORPAY_PLAN_ROAST_POWER,
      notes: { userId, tier: 'power', plan_type: 'monthly' },
      receipt: `power_${userId}_${Date.now()}`,
    }),
    global: { amount: 799, currency: 'USD', priceId: process.env.STRIPE_PRICE_ROAST_POWER, metadata: { tier: 'power', plan_type: 'monthly' } },
  },
  power_annual: {
    india: (userId: string) => ({
      amount: 399000, currency: 'INR',
      planId: process.env.RAZORPAY_PLAN_ROAST_POWER_ANNUAL,
      notes: { userId, tier: 'power', plan_type: 'annual' },
      receipt: `power_yr_${userId}_${Date.now()}`,
    }),
    global: { amount: 3990, currency: 'USD', priceId: process.env.STRIPE_PRICE_ROAST_POWER_ANNUAL, metadata: { tier: 'power', plan_type: 'annual' } },
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
    const opts = product.india(user.id);

    // One-time payment (starter) → order
    if (plan === 'starter') {
      const order = await rp.orders.create({
        amount: opts.amount,
        currency: opts.currency,
        receipt: opts.receipt,
        notes: opts.notes,
      });
      logger.apiResponse('POST', '/api/checkout', 200, Date.now() - startTime, { method: 'razorpay', plan, market });
      return NextResponse.json({
        method: 'razorpay',
        orderId: order.id,
        key: NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: opts.amount,
        currency: opts.currency,
      });
    }

    // Subscription (pro_monthly, pro_annual, power_monthly, power_annual)
    if (!opts.planId) {
      logger.apiError('POST', '/api/checkout', new Error('Razorpay plan not configured'), { plan });
      return NextResponse.json({ error: 'Razorpay plan not configured' }, { status: 500 });
    }
    const subscription = await rp.subscriptions.create({
      plan_id: opts.planId,
      customer_notify: 1,
      quantity: 1,
      total_count: plan.includes('annual') ? 1 : 12,
      notes: opts.notes,
    });
    logger.apiResponse('POST', '/api/checkout', 200, Date.now() - startTime, { method: 'razorpay', plan, market, subscriptionId: subscription.id });
    return NextResponse.json({
      method: 'razorpay',
      subscriptionId: subscription.id,
      key: NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });
  }

  // Global — Stripe
  const stripe = getStripe();
  const priceId = product.global.priceId;
  if (!priceId) {
    logger.apiError('POST', '/api/checkout', new Error('Stripe price not configured'), { plan });
    return NextResponse.json({ error: 'Stripe price not configured' }, { status: 500 });
  }

  const isOneTime = plan === 'starter';
  const session = await stripe.checkout.sessions.create({
    mode: isOneTime ? 'payment' : 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email,
    metadata: product.global.metadata,
    success_url: `${origin}/roast?checkout=success`,
    cancel_url: `${origin}/pricing?cancelled=true`,
  });
  logger.apiResponse('POST', '/api/checkout', 200, Date.now() - startTime, { method: 'stripe', plan, market, sessionId: session.id });
  return NextResponse.json({ method: 'stripe', url: session.url });
}
