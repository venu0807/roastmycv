'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { RoastResult } from '@/types';
import { createClient } from '@/lib/supabase/client';

export default function RoastPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RoastResult | null>(null);
  const [error, setError] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [user, setUser] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const signIn = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleUpload = async () => {
    if (!file) return;

    // Client-side file validation
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Please upload PDF or DOCX.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum 5MB.');
      return;
    }

    setLoading(true);
    setError('');

    const form = new FormData();
    form.append('resume', file);

    const res = await fetch('/api/roast', { method: 'POST', body: form });

    if (res.status === 403) {
      const data = await res.json();
      if (data.upgrade && user) {
        setShowUpgrade(true);
      } else {
        setShowAuth(true);
      }
      setLoading(false);
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Something failed');
      setLoading(false);
      return;
    }

    const data = await res.json();
    setResult(data.roast);
    setLoading(false);
  };

  if (showUpgrade) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Daily limit reached</h2>
          <p className="text-zinc-400 mb-6">You&apos;ve used your free roast for today.</p>
          <a href="/pricing" className="inline-block bg-red-600 hover:bg-red-700 px-8 py-3 rounded-xl font-bold transition-colors">Upgrade to Pro →</a>
          <p className="mt-4 text-sm text-zinc-500">Or come back tomorrow for another free roast</p>
        </div>
      </div>
    );
  }

  if (showAuth) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Free trial used</h2>
          <p className="text-zinc-400 mb-6">Sign in for unlimited roasts. Free: 1 roast/day.</p>
          <button onClick={signIn} className="bg-red-600 hover:bg-red-700 px-8 py-3 rounded-xl font-bold transition-colors">Sign in with Google</button>
          <p className="mt-4 text-sm text-zinc-500">Or come back tomorrow for another free roast</p>
        </div>
      </div>
    );
  }

  if (result) {
    return <ResultView result={result} onReset={() => { setResult(null); setFile(null); }} user={user} signIn={signIn} signOut={signOut} />;
  }

  const severityColor = (s: string) => {
    switch (s) {
      case 'brutal': return 'text-red-500';
      case 'medium': return 'text-yellow-500';
      default: return 'text-green-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-red-500">RoastMyCV</h1>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-zinc-400">{user.email?.split('@')[0]}</span>
                <button onClick={signOut} className="text-xs text-zinc-500 hover:text-zinc-300">Sign out</button>
              </>
            ) : (
              <button onClick={signIn} className="text-sm text-zinc-400 hover:text-white">Sign in</button>
            )}
            <Link href="/pricing" className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium">Pro</Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-black mb-2">Upload Your Resume</h2>
        <p className="text-zinc-400 mb-10">PDF or DOCX, max 5MB</p>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-zinc-700 rounded-2xl p-16 mb-8 cursor-pointer hover:border-red-500 transition-colors"
        >
          {file ? (
            <div>
              <p className="text-lg font-medium text-green-400">✓ {file.name}</p>
              <p className="text-sm text-zinc-500">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-5xl mb-4">📄</p>
              <p className="text-zinc-400">Click to select or drag resume here</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        </div>

        {error && <p className="text-red-400 mb-4">{error}</p>}

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-10 py-4 rounded-xl text-lg font-bold transition-colors"
        >
          {loading ? 'Processing...' : 'Roast My CV 🔥'}
        </button>

        <div className="mt-20 grid grid-cols-3 gap-4 text-center text-sm text-zinc-500">
          <div>
            <p className="text-2xl font-bold text-white">30s</p>
            <p>Processing time</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">Free</p>
            <p>1 roast/day</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">AI</p>
            <p>Llama-3.1-70B</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function ResultView({ result, onReset, user, signIn, signOut }: { result: RoastResult; onReset: () => void; user: any; signIn: () => void; signOut: () => void; }) {
  const color = result.score >= 70 ? 'text-green-500' : result.score >= 40 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-red-500">RoastMyCV</h1>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-zinc-400">{user.email?.split('@')[0]}</span>
                <button onClick={signOut} className="text-xs text-zinc-500 hover:text-zinc-300">Sign out</button>
                <Link href="/pricing" className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium">Pro</Link>
              </>
            ) : (
              <button onClick={signIn} className="text-sm text-zinc-400 hover:text-white">Sign in</button>
            )}
          </div>
          <button onClick={onReset} className="text-zinc-400 hover:text-white text-sm">Roast another →</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <div className={`text-7xl font-black mb-2 ${color}`}>{result.score}</div>
          <p className="text-lg text-zinc-400 italic mb-2">&ldquo;{result.oneLiner}&rdquo;</p>
          <p className="text-zinc-500 text-sm">{result.severity === 'brutal' ? '🔥 Brutal roast' : result.severity === 'medium' ? '⚠️ Medium heat' : '✅ Mild'}</p>
        </div>

        <div className="mb-10">
          <h3 className="font-bold text-lg mb-4">✅ Strengths</h3>
          <ul className="space-y-2">
            {result.strengths.map((s, i) => (
              <li key={i} className="bg-zinc-800 p-3 rounded-lg text-zinc-300">✓ {s}</li>
            ))}
          </ul>
        </div>

        <div className="mb-10">
          <h3 className="font-bold text-lg mb-4 text-red-400">🔥 Roast Points</h3>
          <div className="space-y-4">
            {result.roastPoints.map((p, i) => (
              <div key={i} className="bg-zinc-800 rounded-xl p-5 border-l-4 border-red-500">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-zinc-700 px-2 py-1 rounded">{p.category}</span>
                  <span className="text-xs">{'🔥'.repeat(p.severity)}</span>
                </div>
                <p className="font-semibold mb-1">{p.issue}</p>
                <p className="text-sm text-zinc-400">{p.suggestion}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-bold text-lg mb-4 text-emerald-400">📋 Action Plan</h3>
          <div className="space-y-3">
            {result.actionPlan.map((a, i) => (
              <div key={i} className="bg-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-1 rounded ${a.priority === 'critical' ? 'bg-red-900 text-red-300' : a.priority === 'high' ? 'bg-yellow-900 text-yellow-300' : 'bg-zinc-700 text-zinc-300'}`}>
                    {a.priority}
                  </span>
                  <span className="text-xs text-zinc-500">{a.area}</span>
                </div>
                <p className="font-semibold">{a.task}</p>
                <p className="text-sm text-zinc-400 mt-1">{a.details}</p>
                {a.resources?.length ? (
                  <div className="mt-2 flex gap-2">
                    {a.resources.map((r, j) => (
                      <a key={j} href={r} className="text-xs text-blue-400 underline">Resource {j + 1}</a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-16">
          <button onClick={onReset} className="bg-red-600 hover:bg-red-700 px-8 py-3 rounded-xl font-bold">
            Roast Another CV
          </button>
        </div>
      </main>
    </div>
  );
}

if (process.env.NODE_ENV === 'development') {
  const mockRoast: RoastResult = {
    score: 42,
    severity: 'brutal',
    oneLiner: 'Your resume is a wall of text that recruiters will skim for 2 seconds before moving on.',
    strengths: ['Has technical skills listed', 'Shows some project work', 'Includes education details'],
    roastPoints: [
      { category: 'formatting', issue: 'No bullet points — walls of paragraphs. ATS will choke.', severity: 3, suggestion: 'Rewrite experience as bullet points starting with strong action verbs.' },
      { category: 'ats', issue: 'No metrics anywhere. "Worked on..." means nothing without numbers.', severity: 2, suggestion: 'Add metrics: "Reduced load time by 40%", "Managed 5-member team".' },
      { category: 'skills', issue: '17 skills listed. Recruiters read the first 5.', severity: 2, suggestion: 'Trim to 8-10 relevant skills. Add proficiency levels.' },
      { category: 'experience', issue: 'Weak action verbs like "Was responsible for", "Worked on".', severity: 3, suggestion: 'Replace with: Built, Implemented, Optimized, Led, Delivered.' },
      { category: 'content', issue: 'No GitHub or portfolio links visible.', severity: 1, suggestion: 'Add GitHub, LinkedIn, and portfolio at top.' },
    ],
    actionPlan: [
      { priority: 'critical', area: 'formatting', task: 'Convert to bullet points', details: 'ATS systems parse bullets. Paragraphs cause parsing errors.', resources: ['https://resumegenius.com/resume-builder'] },
      { priority: 'high', area: 'content', task: 'Add metrics to every bullet', details: 'Every responsibility needs a number. Impact > responsibilities.' },
      { priority: 'medium', area: 'skills', task: 'Trim skill list to 10 max', details: 'Prioritize in-demand skills. Remove MS Word, Excel basics.' },
      { priority: 'medium', area: 'projects', task: 'Add GitHub links', details: 'Hiring managers check GitHub before interview. Ensure pinned repos look good.' },
      { priority: 'low', area: 'layout', task: 'One page max', details: '2-page resumes get ignored in first screenings unless you have 10+ years experience.' },
    ],
  };
  // ponytail: mockRoast only exists for dev testing
}
