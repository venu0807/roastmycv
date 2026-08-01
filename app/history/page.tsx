'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function HistoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [tier, setTier] = useState('free');
  const supabase = createClient();

  async function loadHistory() {
    setLoading(true);
    const res = await fetch('/api/history');
    if (res.ok) {
      const data = await res.json();
      setItems(data.items || []);
      setTier(data.tier);
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) loadHistory();
      else setLoading(false);
    });
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Sign in to view history</h1>
          <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/history` } })}
            className="bg-red-600 hover:bg-red-700 px-8 py-3 rounded-xl font-bold">
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-red-500">RoastMyCV</Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">{user.email?.split('@')[0]}</span>
            <Link href="/optimize" className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg font-medium">
              ← Optimize
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-black mb-2">History</h1>
        <p className="text-zinc-500 text-sm mb-6">
          {tier === 'power' ? '6 months of history' : tier === 'pro' ? '3 months of history' : '1 month of history'}
          {(tier === 'free' || tier === 'starter') && (
            <Link href="/pricing" className="ml-2 text-red-400 underline">Upgrade for more →</Link>
          )}
        </p>

        {loading ? (
          <div className="text-center py-12"><p className="text-zinc-500">Loading...</p></div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">📋</p>
            <p className="text-zinc-400">No history yet</p>
            <Link href="/optimize" className="text-red-400 underline text-sm mt-2 inline-block">Optimize your first resume →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item: any) => (
              <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${item.type === 'optimize' ? 'bg-blue-900/50 text-blue-300' : 'bg-red-900/50 text-red-300'}`}>
                        {item.type === 'optimize' ? '📈 ATS Optimize' : '🔥 Roast'}
                      </span>
                      {item.type === 'optimize' && item.originalScore != null && (
                        <span className="text-xs text-zinc-500">
                          {item.originalScore} → <span className="text-emerald-400 font-medium">{item.optimizedScore}</span>
                          {item.keywordGapCount > 0 && ` · ${item.keywordGapCount} keywords`}
                        </span>
                      )}
                      {item.type === 'roast' && item.score != null && (
                        <span className="text-xs text-zinc-500">Score: {item.score}</span>
                      )}
                    </div>
                    {item.jobTitle && <p className="text-sm text-zinc-300 truncate">{item.jobTitle}</p>}
                    <p className="text-xs text-zinc-600 mt-1">{new Date(item.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
