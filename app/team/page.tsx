'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

declare global {
  interface Window { Razorpay?: any; }
}

export default function TeamPage() {
  const [user, setUser] = useState<any>(null);
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null);
  const [market, setMarket] = useState<'india' | 'global'>('india');
  const [topupAmount, setTopupAmount] = useState(500);
  const [topupLoading, setTopupLoading] = useState(false);

  const sb = useCallback(() => supabase ?? createClient(), [supabase]);

  useEffect(() => {
    const s = createClient();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cache client, intentional
    setSupabase(s);
    s.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: { subscription } } = s.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    loadTeam(s);
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTeam(s: any) {
    setLoading(true);
    const res = await fetch('/api/team/info');
    if (res.ok) {
      const data = await res.json();
      setTeam(data.team);
      setMembers(data.members || []);
      setTransactions(data.transactions || []);
    }
    setLoading(false);
  }

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(''), 4000);
  };

  const createTeam = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/team/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: createName.trim() }),
    });
    if (res.ok) {
      showMsg('Team created!');
      setCreateName('');
      await loadTeam(sb());
    } else {
      const d = await res.json();
      showMsg(d.error || 'Failed to create team', 'error');
    }
    setCreating(false);
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim() || !team) return;
    setInviting(true);
    const res = await fetch('/api/team/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team.id, memberEmail: inviteEmail.trim(), action: 'invite' }),
    });
    if (res.ok) {
      showMsg(`${inviteEmail} added to team!`);
      setInviteEmail('');
      await loadTeam(sb());
    } else {
      const d = await res.json();
      showMsg(d.error || 'Failed to invite', 'error');
    }
    setInviting(false);
  };

  const removeMember = async (email: string) => {
    if (!team) return;
    const res = await fetch('/api/team/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team.id, memberEmail: email, action: 'remove' }),
    });
    if (res.ok) {
      showMsg(`${email} removed from team`);
      await loadTeam(sb());
    } else {
      showMsg('Failed to remove member', 'error');
    }
  };

  const loadRazorpay = useCallback(() => new Promise<any>((resolve) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(window.Razorpay);
    document.body.appendChild(s);
  }), []);

  const handleTopup = async () => {
    if (!team) return;
    setTopupLoading(true);
    const res = await fetch('/api/team/wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: team.id, amount: topupAmount, market }),
    });
    const data = await res.json();
    if (!res.ok) { showMsg(data.error || 'Top-up failed', 'error'); setTopupLoading(false); return; }

    if (data.method === 'razorpay') {
      const Razorpay = await loadRazorpay();
      const rzp = new Razorpay({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        name: 'RoastMyCV',
        description: `Team Wallet Top-up — ₹${topupAmount}`,
        prefill: { email: user.email },
        theme: { color: '#DC2626' },
        order_id: data.orderId,
        handler: () => { showMsg('Wallet topped up!'); loadTeam(sb()); },
        modal: { ondismiss: () => setTopupLoading(false) },
      });
      rzp.open();
      rzp.on('payment.failed', () => setTopupLoading(false));
    } else if (data.url) {
      window.location.href = data.url;
    }
    setTopupLoading(false);
  };

  const isAdmin = team && members.some((m: any) => m.user_id === user?.id && m.role === 'admin');
  const [showTopup, setShowTopup] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-red-900/20 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">R</span>
            </div>
            <span className="text-xl text-white" style={{ fontFamily: "'Righteous', cursive" }}>RoastMyCV</span>
          </Link>
          <Link href="/pricing" className="text-sm text-zinc-400 hover:text-white">← Pricing</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {msg && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium ${msgType === 'success' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/30' : 'bg-red-900/50 text-red-300 border border-red-700/30'}`}>
            {msg}
          </div>
        )}

        {!user ? (
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold mb-4">Team Plans</h1>
            <p className="text-zinc-400 mb-6">Sign in to create or manage your team.</p>
            <button onClick={() => sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/team` } })}
              className="bg-red-600 hover:bg-red-700 px-8 py-3 rounded-xl font-bold">
              Sign in with Google
            </button>
          </div>
        ) : team ? (
          <>
            {/* Team Dashboard */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">{team.name}</h1>
                  <p className="text-sm text-zinc-500">Team wallet</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-amber-400">₹{team.wallet_balance.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500">wallet balance</p>
                </div>
              </div>

              {/* Top-up */}
              {isAdmin && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 mb-6">
                  <h3 className="font-semibold mb-3">Top up wallet</h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex gap-2">
                      {[500, 1000, 2500, 5000].map(a => (
                        <button key={a} onClick={() => setTopupAmount(a)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${topupAmount === a ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                          ₹{a}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setMarket('india')}
                        className={`px-3 py-2 rounded-lg text-xs ${market === 'india' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-500'}`}>🇮🇳 INR</button>
                      <button onClick={() => setMarket('global')}
                        className={`px-3 py-2 rounded-lg text-xs ${market === 'global' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-500'}`}>🌍 USD</button>
                    </div>
                    <button onClick={handleTopup} disabled={topupLoading}
                      className="bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-all">
                      {topupLoading ? 'Processing...' : `Pay ${market === 'india' ? `₹${topupAmount}` : `~$${Math.round(topupAmount / 83)}`}`}
                    </button>
                  </div>
                </div>
              )}

              {/* Members */}
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 mb-6">
                <h3 className="font-semibold mb-3">Members ({members.length})</h3>
                <div className="space-y-2">
                  {members.map((m: any) => (
                    <div key={m.user_id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold">
                          {(m.profiles?.full_name?.[0] || m.profiles?.email?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{m.profiles?.full_name || m.profiles?.email || 'Unknown'}</p>
                          <p className="text-xs text-zinc-500">{m.role} · Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      {isAdmin && m.role !== 'admin' && (
                        <button onClick={() => removeMember(m.profiles.email)}
                          className="text-xs text-red-400 hover:text-red-300">Remove</button>
                      )}
                    </div>
                  ))}
                </div>

                {isAdmin && (
                  <div className="flex gap-2 mt-4 pt-4 border-t border-zinc-800">
                    <input
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="member@email.com"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-500"
                    />
                    <button onClick={inviteMember} disabled={inviting || !inviteEmail.trim()}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all">
                      {inviting ? '...' : 'Invite'}
                    </button>
                  </div>
                )}
              </div>

              {/* Transactions */}
              {transactions.length > 0 && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
                  <h3 className="font-semibold mb-3">Recent transactions</h3>
                  <div className="space-y-2 text-sm">
                    {transactions.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between py-1.5">
                        <span className="text-zinc-400">{t.description || t.type}</span>
                        <span className="text-amber-400 font-medium">+₹{t.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Create Team */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">Create a Team</h1>
              <p className="text-zinc-400">Shared wallet for companies &amp; teams. Pay per use, no monthly lock-in.</p>
            </div>

            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 max-w-md mx-auto">
              <div className="mb-6">
                <label className="text-sm text-zinc-400 mb-2 block">Team name</label>
                <input
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="e.g. Acme Corp HR"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500"
                  onKeyDown={e => e.key === 'Enter' && createTeam()}
                />
              </div>
              <button onClick={createTeam} disabled={creating || !createName.trim()}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white py-3 rounded-xl font-semibold transition-all">
                {creating ? 'Creating...' : 'Create Team — ₹500 min top-up'}
              </button>
              <p className="text-xs text-zinc-500 mt-4 text-center">
                You&apos;ll be the team admin. Add members after creating.
              </p>
            </div>

            {/* Features */}
            <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto mt-10">
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <p className="font-semibold text-sm mb-1">💰 Shared wallet</p>
                <p className="text-xs text-zinc-500">Non-expiring balance. Pay per use.</p>
              </div>
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <p className="font-semibold text-sm mb-1">👥 Unlimited members</p>
                <p className="text-xs text-zinc-500">Add as many as you need.</p>
              </div>
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <p className="font-semibold text-sm mb-1">📊 Usage tracking</p>
                <p className="text-xs text-zinc-500">Monitor per-member activity.</p>
              </div>
              <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <p className="font-semibold text-sm mb-1">🔓 All features</p>
                <p className="text-xs text-zinc-500">Unlimited roasts &amp; downloads.</p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
