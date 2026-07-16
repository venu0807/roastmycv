import Razorpay from 'razorpay';

export function getRazorpay() {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error('Razorpay not configured');
  return new Razorpay({ key_id: key, key_secret: secret });
}

export const NEXT_PUBLIC_RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
