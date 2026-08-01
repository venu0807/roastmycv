import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const text = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 401 });

  const expected = crypto.createHmac('sha256', secret).update(text).digest();
  const sig = Buffer.from(signature, 'hex');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(text);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const payment = event.payload.payment?.entity;
  const subscription = event.payload.subscription?.entity;

  // ── payment.captured ──────────────────────────────────────────────────
  if (event.event === 'payment.captured' && payment) {
    const userId = payment.notes?.userId
      || payment.notes?.user_id
      || (typeof payment.notes === 'string' ? JSON.parse(payment.notes).userId : null);
    const receipt = payment.receipt || payment.notes?.receipt || '';

    if (!userId) return NextResponse.json({ received: true });

    // Detect tier from receipt prefix
    if (receipt.startsWith('lifetime') || receipt.startsWith('life')) {
      await supabase.rpc('update_user_tier', { user_id: userId, new_tier: 'power' });
    }
    else if (receipt.startsWith('starter') || receipt.startsWith('start')) {
      // Grant 1 download credit, keep tier as free (starter is one-time download)
      await supabase.rpc('grant_download_credit', { grant_user_id: userId, credits: 1 });
    }
    else if (receipt.startsWith('team')) {
      // Team wallet top-up
      const amount = payment.amount || 0;
      const teamId = payment.notes?.teamId;
      if (teamId) {
        await supabase.rpc('add_team_wallet', {
          team_id: teamId,
          amount: amount,
          reference: `payment_${payment.id}`,
        });
      }
    }
    else {
      // Fallback: check notes.tier
      const tier = payment.notes?.tier || 'pro';
      if (tier === 'lifetime') {
        await supabase.rpc('update_user_tier', { user_id: userId, new_tier: 'power' });
      }
    }
  }

  // ── subscription.activated ────────────────────────────────────────────
  if (event.event === 'subscription.activated' && subscription) {
    const userId = subscription.notes?.userId
      || subscription.notes?.user_id
      || (typeof subscription.notes === 'string' ? JSON.parse(subscription.notes).userId : null);

    if (!userId) return NextResponse.json({ received: true });

    // Determine tier + duration from the plan_id
    const planId = subscription.plan_id;
    const tier = subscription.notes?.tier || detectTierFromPlanId(planId);

    if (tier === 'pro' || tier === 'power') {
      const isAnnual = detectIsAnnual(subscription);
      const expiryDays = isAnnual ? 365 : 30;
      await supabase.rpc('update_user_tier_with_expiry', {
        user_id: userId,
        new_tier: tier,
        expiry_days: expiryDays,
      });
      // Store subscription ID for cancellation tracking
      await supabase.from('profiles').update({
        subscription_id: subscription.id,
      }).eq('id', userId);
    }
  }

  // ── subscription.completed ────────────────────────────────────────────
  if (event.event === 'subscription.completed' && subscription) {
    const userId = subscription.notes?.userId
      || subscription.notes?.user_id
      || (typeof subscription.notes === 'string' ? JSON.parse(subscription.notes).userId : null);
    if (userId) {
      // Only downgrade if no other active subscription
      await supabase.rpc('update_user_tier', { user_id: userId, new_tier: 'free' });
      await supabase.from('profiles').update({ subscription_id: null }).eq('id', userId);
    }
  }

  return NextResponse.json({ received: true });
}

function detectTierFromPlanId(planId: string): string {
  const env = process.env as Record<string, string>;
  if (planId === env.RAZORPAY_PLAN_ROAST_PRO) return 'pro';
  if (planId === env.RAZORPAY_PLAN_ROAST_PRO_ANNUAL) return 'pro';
  if (planId === env.RAZORPAY_PLAN_ROAST_POWER) return 'power';
  if (planId === env.RAZORPAY_PLAN_ROAST_POWER_ANNUAL) return 'power';
  return 'pro'; // fallback
}

function detectIsAnnual(subscription: any): boolean {
  const planId = subscription.plan_id;
  const env = process.env as Record<string, string>;
  return planId === env.RAZORPAY_PLAN_ROAST_PRO_ANNUAL
      || planId === env.RAZORPAY_PLAN_ROAST_POWER_ANNUAL;
}
