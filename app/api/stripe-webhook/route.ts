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

  // Use service role key for webhook (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.client_reference_id;
  if (!userId) return NextResponse.json({ received: true });

  if (event.type === 'checkout.session.completed') {
    const mode = session.mode;
    const tier = mode === 'payment' ? 'lifetime' : 'pro';
    await supabase.rpc('update_user_tier', { user_id: userId, new_tier: tier });
  }

  return NextResponse.json({ received: true });
}