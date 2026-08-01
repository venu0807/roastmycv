import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const text = await req.text();
  const signature = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(text, signature!, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── checkout.session.completed ──────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    if (!userId) return NextResponse.json({ received: true });

    const metadata = session.metadata || {};
    const tier = metadata.tier || 'pro';
    const mode = session.mode;

    if (mode === 'payment') {
      // One-time payment: starter or lifetime
      if (tier === 'starter') {
        await supabase.rpc('grant_download_credit', { grant_user_id: userId, credits: 1 });
      } else if (tier === 'lifetime') {
        await supabase.rpc('update_user_tier', { user_id: userId, new_tier: 'power' });
      } else if (tier === 'team') {
        const teamId = metadata.teamId;
        const amount = parseInt(metadata.wallet_amount || '500', 10);
        if (teamId) {
          await supabase.rpc('add_team_wallet', {
            team_id: teamId,
            amount: amount * 100, // convert to paise/cents equivalent
            reference: `stripe_session_${session.id}`,
          });
        }
      }
    } else if (mode === 'subscription') {
      // Subscription: pro or power (monthly or annual)
      const isAnnual = metadata.plan_type === 'annual';
      const expiryDays = isAnnual ? 365 : 30;
      await supabase.rpc('update_user_tier_with_expiry', {
        user_id: userId,
        new_tier: tier,
        expiry_days: expiryDays,
      });
    }
  }

  // ── customer.subscription.deleted ───────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    // Find the user by their Stripe customer ID
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, subscription_tier')
      .eq('stripe_customer_id', subscription.customer as string)
      .maybeSingle();

    if (profiles) {
      await supabase.rpc('update_user_tier', {
        user_id: profiles.id,
        new_tier: 'free',
      });
    }
  }

  return NextResponse.json({ received: true });
}
