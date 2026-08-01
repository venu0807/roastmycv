// setup-razorpay-plans.mjs
// Razorpay plan setup script for roastmycv.com
// Execute this script in the Razorpay Dashboard

const ROASTMYCV_RAZORPAY_PLANS = {
  // Monthly Pro Plan (for Pro tier)
  ROASTMYCV_PRO_MONTHLY: {
    name: 'RoastMyCV Pro Monthly Subscription',
    description: 'RoastMyCV Pro Plan - Monthly access to pro features',
    amount: 29900, // INR 29,900
    currency: 'INR',
    interval: 'monthly',
    notes: {
      product: 'roastmycv_pro_monthly',
      tier: 'pro',
      plan_type: 'subscription',
      project: 'roastmycv'
    },
    receipt: `rost_pro_monthly_######`, // Generate unique receipt number
    AR: {
      terms: 1, // 1 month
      short_term: {
        payment_types: ['06', '07', '10'], // Credit card, Debit card, Net banking
        free_months: 0,
        bank_account: {
          name: 'VENU GOPAL REDDY',
          ifsc: 'HDFC0000123',
          account: '50000123456789'
        }
      },
      recurring: {
        duration: 12, // 12 months max subscription
        usage_past: 1,
        usage_from: 1
      }
    }
  },

  // Upgrade/Change Plan
  ROASTMYCV_PRO_MONTHLY_UPGRADE: {
    name: 'RoastMyCV Pro Plan Upgrade',
    description: 'Upgrade current subscription to Pro features',
    amount: 29900,
    currency: 'INR',
    interval: 'month',
    notes: {
      product: 'roastmycv_pro_upgrade',
      tier: 'pro',
      upgrade_from: 'free_or_basic',
      project: 'roastmycv'
    },
    receipt: `rost_upgrade_######`
  }
};

// Instructions for manual setup:
console.log(`
🔧 ROASTMYCV RAZORPAY PLAN SETUP

===================================

Navigate to: https://dashboard.razorpay.com/signin

Create the following plans:

1. RoastMyCV Pro Monthly Subscription
   - Name: RoastMyCV Pro Monthly Subscription
   - Amount: ₹29,900
   - Currency: INR
   - Interval: Monthly
   - Notes: {"product": "roastmycv_pro_monthly", "tier": "pro", "project": "roastmycv"}

2. RoastMyCV Pro Plan Upgrade
   - Name: RoastMyCV Pro Plan Upgrade
   - Amount: ₹29,900
   - Currency: INR
   - Interval: Month
   - Notes: {"product": "roastmycv_pro_upgrade", "tier": "pro"}

===================================

After creating these plans, set the following environment variables in your Vercel dashboard:

Project: roastmycv
─────────────────────────────────
- RAZORPAY_PLAN_ROAST_PRO=plan_[generated_plan_id]

Also configure:
─────────────────────────────────
- RAZORPAY_KEY_ID=pk_live_[your_live_key_id]
- RAZORPAY_KEY_SECRET=secret_[your_live_secret]
- NEXT_PUBLIC_RAZORPAY_KEY_ID=pk_live_[your_live_key_id]
- RAZORPAY_WEBHOOK_SECRET=webhook_secret_[your_webhook_secret]

===================================

For webhook setup:
─────────────────────────────────
1. Go to: Settings → Webhooks
2. Add URL: https://roastmycv.vercel.app/api/razorpay-webhook
3. Select events: payment.captured, subscription.activated
4. Use webhook secret: webhook_secret_[your_webhook_secret]

===================================

Estimated processing fee: ₹149 (Razorpay takes 0.6% + ₹10 per transaction)

Usage in code:
─────────────────────────────────
This will be used in:
- app/api/checkout/route.ts for India market (Razorpay plan)
- app/api/razorpay-webhook/route.ts for webhook handling

===================================
`);

// Export for developer reference
export { ROASTMYCV_RAZORPAY_PLANS }; //