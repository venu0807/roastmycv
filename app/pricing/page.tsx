'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

declare global {
  interface Window { Razorpay?: any; }
}

type Market = 'india' | 'global';
type BillingCycle = 'monthly' | 'yearly';
type PlanKey = 'starter' | 'pro_monthly' | 'pro_annual' | 'power_monthly' | 'power_annual' | 'lifetime' | 'team_500' | 'team_1000';

const PRICES: Record<Market, Record<string, { label: string; monthly: string; yearly?: string }>> = {
  india: {
    free: { label: '₹0', monthly: '₹0' },
    starter: { label: '₹99', monthly: 'one-time' },
    pro: { label: '₹299/mo', monthly: '₹299/mo', yearly: '₹2,490/yr' },
    power: { label: '₹499/mo', monthly: '₹499/mo', yearly: '₹4,990/yr' },
    lifetime: { label: '₹1,499', monthly: 'one-time' },
    team: { label: '₹500', monthly: 'min top-up' },
  },
  global: {
    free: { label: '$0', monthly: '$0' },
    starter: { label: '$1.99', monthly: 'one-time' },
    pro: { label: '$4.99/mo', monthly: '$4.99/mo', yearly: '$24.90/yr' },
    power: { label: '$9.99/mo', monthly: '$9.99/mo', yearly: '$49.90/yr' },
    lifetime: { label: '$19', monthly: 'one-time' },
    team: { label: '$5', monthly: 'min top-up' },
  },
};

export default function PricingPage() {
  const [market, setMarket] = useState<Market>('india');
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null);
  const [userTier, setUserTier] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient();
    setSupabase(sb);

    sb.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        sb.from('profiles').select('tier').eq('id', data.user.id).single()
          .then(({ data: p }) => setUserTier(p?.tier ?? null));
      }
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        sb.from('profiles').select('tier').eq('id', session.user.id).single()
          .then(({ data: p }) => setUserTier(p?.tier ?? null));
      } else {
        setUserTier(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const getSupabase = useCallback(() => supabase ?? createClient(), [supabase]);

  const loadRazorpay = useCallback(() => new Promise<any>((resolve) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(window.Razorpay);
    document.body.appendChild(s);
  }), []);

  const signIn = useCallback(() => {
    getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=/pricing` },
    });
  }, [getSupabase]);

  const handleCheckout = async (plan: PlanKey) => {
    if (!user) { signIn(); return; }
    setLoading(plan);

    // Map plan key to what the API expects
    let apiPlan = plan;
    if (plan === 'team_500') apiPlan = 'power_monthly'; // team isn't in PLANS yet — use generic
    if (plan === 'team_1000') apiPlan = 'power_monthly';

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market, plan: apiPlan }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); setLoading(null); return; }

    if (data.method === 'razorpay') {
      const Razorpay = await loadRazorpay();
      const options: any = {
        key: data.key,
        amount: data.amount || 29900,
        currency: data.currency || 'INR',
        name: 'RoastMyCV',
        description: plan === 'starter' ? 'Starter — 1 Download Credit'
          : plan === 'lifetime' ? 'Lifetime Access'
          : plan.includes('pro') ? 'Pro Subscription'
          : plan.includes('power') ? 'Power Subscription'
          : 'RoastMyCV',
        prefill: { email: user.email },
        theme: { color: '#DC2626' },
        handler: () => { window.location.href = '/roast?checkout=success'; },
        modal: { ondismiss: () => setLoading(null) },
      };
      if (data.orderId) options.order_id = data.orderId;
      if (data.subscriptionId) options.subscription_id = data.subscriptionId;
      const rzp = new Razorpay(options);
      rzp.on('payment.failed', () => setLoading(null));
      rzp.open();
    } else if (data.url) {
      window.location.href = data.url;
    }
    setLoading(null);
  };

  const price = PRICES[market];

  const isCurrentTier = (tier: string) => {
    if (!userTier) return false;
    if (tier === 'free' && userTier === 'free') return true;
    if (tier === 'starter' && userTier === 'starter') return true;
    if (tier === 'pro' && userTier === 'pro') return true;
    if (tier === 'power' && userTier === 'power') return true;
    if (tier === 'lifetime' && userTier === 'lifetime') return true;
    if (tier === 'team' && userTier === 'team') return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-red-900/20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">R</span>
            </div>
            <span className="text-xl text-white" style={{ fontFamily: "'Righteous', cursive" }}>RoastMyCV</span>
          </Link>
          <div className="flex items-center gap-4">
            {user && <span className="text-sm text-zinc-500">{user.email?.split('@')[0]}</span>}
            <Link href="/roast" className="gradient-btn text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-red-500/20">
              Roast My CV
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 pt-28 pb-20">
        {/* Header */}
        <section className="text-center mb-12 fade-up">
          <div className="floating-badge mb-4 mx-auto w-fit">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Start free, upgrade when you&apos;re serious
          </div>
          <h1 className="font-display text-4xl md:text-6xl text-white mb-4" style={{ fontFamily: "'Righteous', cursive" }}>
            Simple pricing
          </h1>
          <p className="text-lg text-zinc-400 mb-8 measure mx-auto">
            5 roasts a month free. Upgrade to Pro or Power for unlimited roasts, downloads, and AI-powered features.
          </p>

          {/* Market toggle */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="inline-flex bg-zinc-800/80 rounded-xl p-1 backdrop-blur-sm">
              <button onClick={() => setMarket('india')}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${market === 'india' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}>
                🇮🇳 India (₹)
              </button>
              <button onClick={() => setMarket('global')}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${market === 'global' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}>
                🌍 Global ($)
              </button>
            </div>
          </div>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${billing === 'monthly' ? 'bg-zinc-700 text-white shadow-sm' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}>
              Monthly
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`relative px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${billing === 'yearly' ? 'bg-red-600/25 text-red-200 border border-red-500/40' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}>
              Yearly
              {billing === 'yearly' && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white bg-emerald-600/80 border border-emerald-400/40">
                  2 months free
                </span>
              )}
            </button>
          </div>
        </section>

        {/* 4-column grid: Free | Starter | Pro | Power */}
        <div className="grid md:grid-cols-4 gap-5 max-w-5xl mx-auto mb-6">
          {/* Free */}
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 flex flex-col hover:shadow-lg hover:shadow-red-500/5 transition-shadow">
            <h2 className="text-xl font-bold text-white mb-1">Free</h2>
            <p className="text-4xl font-bold text-white mb-4">{price.free.label}</p>
            <ul className="space-y-2.5 mb-6 flex-1 text-sm">
              <Feature present>5 roasts / month</Feature>
              <Feature present>Score + roast + action plan</Feature>
              <Feature present>Full resume preview (no download)</Feature>
              <Feature present>Copy to clipboard</Feature>
              <Feature present>Roast history (1 month)</Feature>
              <Feature missing>PDF / DOCX download</Feature>
              <Feature missing>LinkedIn rewrite</Feature>
              <Feature missing>ATS score report</Feature>
            </ul>
            {isCurrentTier('free') ? (
              <span className="block text-center bg-zinc-800 text-zinc-400 py-3 rounded-xl text-sm font-medium">Current plan</span>
            ) : (
              <Link href="/roast" className="block text-center bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl text-sm font-medium transition-all">
                Try Free
              </Link>
            )}
          </div>

          {/* Starter */}
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 flex flex-col hover:shadow-lg hover:shadow-red-500/5 transition-shadow">
            <h2 className="text-xl font-bold text-white mb-1">Starter</h2>
            <p className="text-4xl font-bold text-white mb-1">{price.starter.label}</p>
            <p className="text-xs text-zinc-500 mb-4">one-time</p>
            <ul className="space-y-2.5 mb-6 flex-1 text-sm">
              <Feature present>Everything in Free</Feature>
              <Feature present>1 PDF + DOCX download</Feature>
              <Feature present>No watermark</Feature>
              <Feature present>No subscription needed</Feature>
              <Feature present>Never expires</Feature>
              <Feature missing>Unlimited roasts</Feature>
              <Feature missing>LinkedIn rewrite</Feature>
            </ul>
            {isCurrentTier('starter') ? (
              <span className="block text-center bg-zinc-800 text-zinc-400 py-3 rounded-xl text-sm font-medium">Purchased</span>
            ) : (
              <button onClick={() => handleCheckout('starter')} disabled={loading === 'starter'}
                className="block w-full text-center bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-medium transition-all">
                {loading === 'starter' ? 'Processing...' : `Buy ${market === 'india' ? '₹99' : '$1.99'}`}
              </button>
            )}
          </div>

          {/* Pro ⭐ */}
          <div className="bg-zinc-900 rounded-3xl border-2 border-red-500 p-6 flex flex-col relative shadow-xl shadow-red-500/10 scale-[1.02]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-btn text-white px-4 py-0.5 rounded-full text-xs font-semibold shadow-lg">BEST VALUE</div>
            <h2 className="text-xl font-bold text-white mb-1">Pro</h2>
            <p className="text-4xl font-bold text-white mb-1">
              {billing === 'yearly' ? price.pro.yearly : price.pro.monthly}
            </p>
            <p className="text-xs text-zinc-500 mb-4">
              {billing === 'yearly' ? 'billed annually' : '/ month'}
              {billing === 'yearly' && <span className="text-emerald-400 ml-1">(2 months free)</span>}
            </p>
            <ul className="space-y-2.5 mb-6 flex-1 text-sm">
              <Feature present customColor="red">Unlimited roasts</Feature>
              <Feature present customColor="red">Unlimited PDF + DOCX downloads</Feature>
              <Feature present customColor="red">No watermark</Feature>
              <Feature present customColor="red">LinkedIn About rewrite</Feature>
              <Feature present customColor="red">ATS compatibility score</Feature>
              <Feature present customColor="red">AI resume builder</Feature>
              <Feature present customColor="red">Priority support</Feature>
              <Feature present customColor="red">Roast history (3 months)</Feature>
              <Feature missing className="opacity-50">Edit before download</Feature>
            </ul>
            {isCurrentTier('pro') ? (
              <span className="block text-center bg-zinc-800 text-zinc-400 py-3 rounded-xl text-sm font-medium">Current plan</span>
            ) : (
              <button
                onClick={() => handleCheckout(billing === 'yearly' ? 'pro_annual' : 'pro_monthly')}
                disabled={loading === 'pro_monthly' || loading === 'pro_annual'}
                className="gradient-btn block w-full text-center text-white py-3 rounded-xl text-sm font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                {loading === 'pro_monthly' || loading === 'pro_annual'
                  ? 'Processing...'
                  : billing === 'yearly'
                    ? `Subscribe ${market === 'india' ? '₹2,490/yr' : '$24.90/yr'}`
                    : `Subscribe ${market === 'india' ? '₹299/mo' : '$4.99/mo'}`
                }
              </button>
            )}
          </div>

          {/* Power */}
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 flex flex-col hover:shadow-lg hover:shadow-red-500/5 transition-shadow">
            <h2 className="text-xl font-bold text-white mb-1">Power</h2>
            <p className="text-4xl font-bold text-white mb-1">
              {billing === 'yearly' ? price.power.yearly : price.power.monthly}
            </p>
            <p className="text-xs text-zinc-500 mb-4">
              {billing === 'yearly' ? 'billed annually' : '/ month'}
              {billing === 'yearly' && <span className="text-emerald-400 ml-1">(2 months free)</span>}
            </p>
            <ul className="space-y-2.5 mb-6 flex-1 text-sm">
              <Feature present customColor="emerald">Everything in Pro</Feature>
              <Feature present customColor="emerald">Edit resume before download</Feature>
              <Feature present customColor="emerald">Edits saved to history</Feature>
              <Feature present customColor="emerald">Roast history (6 months)</Feature>
              <Feature present customColor="emerald">Priority support</Feature>
            </ul>
            {isCurrentTier('power') ? (
              <span className="block text-center bg-zinc-800 text-zinc-400 py-3 rounded-xl text-sm font-medium">Current plan</span>
            ) : (
              <button
                onClick={() => handleCheckout(billing === 'yearly' ? 'power_annual' : 'power_monthly')}
                disabled={loading === 'power_monthly' || loading === 'power_annual'}
                className="block w-full text-center bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-medium transition-all">
                {loading === 'power_monthly' || loading === 'power_annual'
                  ? 'Processing...'
                  : billing === 'yearly'
                    ? `Subscribe ${market === 'india' ? '₹4,990/yr' : '$49.90/yr'}`
                    : `Subscribe ${market === 'india' ? '₹499/mo' : '$9.99/mo'}`
                }
              </button>
            )}
          </div>
        </div>

        {/* Lifetime — standalone row */}
        <div className="max-w-5xl mx-auto mb-6">
          <div className="bg-zinc-900 rounded-3xl border border-zinc-700/50 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-white text-lg">Lifetime Access</h3>
              <p className="text-sm text-zinc-400">One-time purchase. Forever access. All Pro features, no recurring bills.</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-3xl font-bold text-white">{price.lifetime.label}</span>
              {isCurrentTier('lifetime') ? (
                <span className="bg-zinc-800 text-zinc-400 px-6 py-2.5 rounded-xl text-sm font-medium">Purchased</span>
              ) : (
                <button onClick={() => handleCheckout('lifetime')} disabled={loading === 'lifetime'}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all">
                  {loading === 'lifetime' ? 'Processing...' : `Buy ${market === 'india' ? '₹1,499' : '$19'}`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Team */}
        <div className="max-w-5xl mx-auto">
          <div className="bg-zinc-900 rounded-3xl border border-amber-700/30 p-6" style={{ background: 'rgba(245,158,11,0.04)' }}>
            <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
              <div className="shrink-0">
                <h3 className="text-lg font-bold text-white mb-1">Team</h3>
                <p className="text-3xl font-bold text-white mb-1">{price.team.label}</p>
                <p className="text-xs text-zinc-500">{price.team.monthly}</p>
                <p className="text-xs text-zinc-500 mt-2 max-w-xs">Shared wallet for companies &amp; teams. Pay per use, no monthly lock-in.</p>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm flex-1">
                <Feature present customColor="amber">Unlimited roasts &amp; downloads</Feature>
                <Feature present customColor="amber">All features unlocked</Feature>
                <Feature present customColor="amber">Shared wallet — no expiry</Feature>
                <Feature present customColor="amber">Add &amp; manage team members</Feature>
                <Feature present customColor="amber">Per-member usage tracking</Feature>
                <Feature present customColor="amber">Activity dashboard</Feature>
              </ul>
              <Link
                href="/team"
                className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}
              >
                Create a Team →
              </Link>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-sm text-zinc-500 mt-8">
          {market === 'india' ? '🇮🇳 Pay via UPI, Card, NetBanking — Razorpay' : '🌍 Pay via Card — Stripe'}
          {!user && <span> — <button onClick={signIn} className="text-red-500 underline hover:text-red-400">Sign in first</button></span>}
        </p>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto mt-16 space-y-4">
          <h2 className="text-xl font-bold text-white text-center mb-6">Common questions</h2>
          <Faq q="Is it really free to start?" a="Yes. You get 5 free roasts every month at no cost. No credit card required. You only pay if you want to download the PDF or DOCX." />
          <Faq q="What is the Starter plan?" a="₹99 one-time gives you 1 download credit. No subscription, no auto-renewal. Perfect if you only need it once." />
          <Faq q="What is the difference between monthly and yearly?" a="Same features, different billing. Yearly works out to 2 months free compared to paying monthly. Cancel anytime — access continues until end of paid period." />
          <Faq q="What counts as a roast?" a="Each resume you upload and analyze counts as 1 roast. Free tier gets 5/month. Pro and Power get unlimited." />
          <Faq q="Can I cancel my subscription?" a="Yes, anytime. Your plan stays active until the billing period ends, then you return to the free tier." />
          <Faq q="What payment methods are accepted?" a="India: UPI, cards, net banking, wallets via Razorpay. Global: cards via Stripe. PCI-DSS compliant." />
        </div>
      </main>
    </div>
  );
}

function Feature({ present, missing, children, customColor, className }: {
  present?: boolean; missing?: boolean; children: React.ReactNode; customColor?: string; className?: string;
}) {
  const color = customColor || 'emerald';
  const colorMap: Record<string, string> = {
    red: '#f87171',
    emerald: '#34d399',
    amber: '#f59e0b',
  };
  const c = colorMap[color] || '#34d399';
  if (present) {
    return <li className={`flex items-start gap-2 text-zinc-300 ${className || ''}`}>
      <span className="shrink-0 mt-0.5 font-bold" style={{ color: c }}>✓</span>
      {children}
    </li>;
  }
  return <li className={`flex items-start gap-2 text-zinc-600 ${className || ''}`}>
    <span className="shrink-0 mt-0.5">✗</span>
    {children}
  </li>;
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
      <p className="font-semibold text-white text-sm mb-1">{q}</p>
      <p className="text-xs text-zinc-400 leading-relaxed">{a}</p>
    </div>
  );
}
