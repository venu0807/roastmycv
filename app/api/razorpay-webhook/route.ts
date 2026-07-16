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

  // Use service role key for webhook (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userId = event.payload.payment?.entity?.notes?.userId
    || event.payload.subscription?.entity?.notes?.userId;
  if (!userId) return NextResponse.json({ received: true });

  if (event.event === 'payment.captured') {
    const receipt = event.payload.payment.entity.receipt || '';
    const tier = receipt?.startsWith('lifetime') ? 'lifetime' : 'pro';
    await supabase.rpc('update_user_tier', { user_id: userId, new_tier: tier });
  }

  if (event.event === 'subscription.activated') {
    await supabase.rpc('update_user_tier', { user_id: userId, new_tier: 'pro' });
  }

  return NextResponse.json({ received: true });
}