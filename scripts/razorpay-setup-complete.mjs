// razorpay-setup-complete.mjs
// Complete Razorpay payment setup for roastmycv.com
// Run this after getting Razorpay live credentials

const fs = require('fs');
const path = require('path');

// Configuration template - USER TO FILL
const CONFIG = {
  razorpayKeyId: 'rzp_live_xxxxxxxx',        // Get from Razorpay Dashboard
  razorpayKeySecret: 'xxxxxxxx',             // Get from Razorpay Dashboard
  razorpayWebhookSecret: 'xxxxxxxxxxx',       // Get from Razorpay Dashboard
};

console.log('\n🚀 ROASTMYCV RAZORPAY PAYMENT SETUP\n');
console.log('==========================================');
console.log('BEFORE RUNNING: Replace placeholders in CONFIG object');
console.log('==========================================');

// Create Vercel .env.production file for roastmycv
const roastmycvEnv = `# RoastMyCV - Production Environment Variables
# Copy this content to Vercel dashboard for roastmycv project

# Supabase Configuration (already configured)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdXBhYmFzZS1...)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdXBhYmFzZS1...)

# Groq AI (already configured)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxx

# Razorpay Configuration (FILL THESE)
RAZORPAY_KEY_ID=${CONFIG.razorpayKeyId}
RAZORPAY_KEY_SECRET=${CONFIG.razorpayKeySecret}
RAZORPAY_WEBHOOK_SECRET=${CONFIG.razorpayWebhookSecret}
NEXT_PUBLIC_RAZORPAY_KEY_ID=${CONFIG.razorpayKeyId}
RAZORPAY_PLAN_ROAST_PRO=plan_xxxxxxxx

# KV/Upstash (already configured)
UPSTASH_REDIS_REST_URL=https://xxxxxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxxxxx

# Sentry (already configured)
SENTRY_DSN=https://xxxxxxxxxxxx@sentry.io/xxxxxxx
NEXT_PUBLIC_SENTRY_DSN=https://xxxxxxxxxxxx@sentry.io/xxxxxxx

# Vercel Config
NEXT_PUBLIC_APP_URL=https://roastmycv.vercel.app

# Optional Stripe (global payments)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxx
STRIPE_PRICE_ROAST_PRO=price_xxxxxxxx
STRIPE_PRICE_ROAST_LIFETIME=price_xxxxxxxx

# Environment
NODE_ENV=production
NEXT_PHASE=phase-production-build

# GitHub Pages (if applicable)
NEXT_PUBLIC_GITHUB_PAGES_URL=https://venu0807.github.io/roastmycv

# App Config
NEXT_PUBLIC_APP_NAME=RoastMyCV
NEXT_PUBLIC_APP_DESCRIPTION=AI-powered CV analysis and feedback application

# RoastMyCV Specific Config
NEXT_PUBLIC_DEFAULT_JOB_TITLE=Software Engineer
NEXT_PUBLIC_DEFAULT_INDUSTRY=Technology
NEXT_PUBLIC_MAX_CV_LENGTH=50000
NEXT_PUBLIC_ANALYSIS_TIMEOUT=30000