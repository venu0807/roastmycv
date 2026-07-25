'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { KeywordGap, ImprovedBullet } from '@/types';
import ResumeEditor from '@/components/ResumeEditor';

export default function OptimizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'input' | 'result'>('input');
  const [user, setUser] = useState<any>(null);
  const [remaining, setRemaining] = useState(-1);
  const [tier, setTier] = useState('free');
  const [activeTab, setActiveTab] = useState('gaps');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Cover letter state
  const [coverLetterResult, setCoverLetterResult] = useState<any>(null);
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState('');
  const [coverLetterTone, setCoverLetterTone] = useState('professional');

  // Skill roadmap state
  const [skillRoadmapResult, setSkillRoadmapResult] = useState<any>(null);
  const [skillRoadmapLoading, setSkillRoadmapLoading] = useState(false);
  const [skillRoadmapError, setSkillRoadmapError] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [targetRoleInput, setTargetRoleInput] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (!data.user) setError('Sign in to optimize your resume for ATS');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Extract job title from JD on mount
  useEffect(() => {
    if (jobDescription) {
      const firstLine = jobDescription.split('\n')[0].trim();
      setTargetRoleInput(firstLine.slice(0, 80));
    }
  }, [jobDescription]);

  const signIn = () => {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/optimize` },
    });
  };

  const handleOptimize = async () => {
    if (!file || !jobDescription.trim() || !user) return;

    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Please upload PDF or DOCX.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum 5MB.');
      return;
    }
    if (jobDescription.trim().length < 20) {
      setError('Job description too short (min 20 characters).');
      return;
    }

    setLoading(true);
    setError('');
    setCoverLetterResult(null);
    setSkillRoadmapResult(null);

    const form = new FormData();
    form.append('resume', file);
    form.append('jobDescription', jobDescription);

    const res = await fetch('/api/optimize', { method: 'POST', body: form });

    if (res.status === 429) {
      const data = await res.json();
      if (data.upgrade) setShowUpgrade(true);
      else setError(data.error || 'Rate limit reached');
      setLoading(false);
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Optimization failed');
      setLoading(false);
      return;
    }

    const data = await res.json();
    setResult(data);
    setRemaining(data.remaining ?? -1);
    setTier(data.tier ?? 'free');
    setStep('result');
    setLoading(false);
  };

  const handleGenerateCoverLetter = async () => {
    if (!file || !jobDescription || !user) return;

    setCoverLetterLoading(true);
    setCoverLetterError('');

    const form = new FormData();
    form.append('resume', file);
    form.append('jobDescription', jobDescription);
    form.append('tone', coverLetterTone);

    const res = await fetch('/api/cover-letter', { method: 'POST', body: form });

    if (res.status === 403) {
      const data = await res.json();
      setCoverLetterError(data.upgrade ? 'Upgrade to Pro or Power for cover letters' : data.error);
      setCoverLetterLoading(false);
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      setCoverLetterError(data.error || 'Cover letter generation failed');
      setCoverLetterLoading(false);
      return;
    }

    const data = await res.json();
    setCoverLetterResult(data.coverLetter || data);
    setCoverLetterLoading(false);
  };

  const handleGenerateRoadmap = async () => {
    if (!skillsInput.trim() || !targetRoleInput.trim() || !user) return;

    setSkillRoadmapLoading(true);
    setSkillRoadmapError('');

    const skills = skillsInput.split(',').map(s => s.trim()).filter(Boolean);

    const res = await fetch('/api/skill-roadmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills, targetRole: targetRoleInput.trim() }),
    });

    if (res.status === 403) {
      const data = await res.json();
      setSkillRoadmapError(data.upgrade ? 'Upgrade to Pro or Power for skill roadmaps' : data.error);
      setSkillRoadmapLoading(false);
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      setSkillRoadmapError(data.error || 'Roadmap generation failed');
      setSkillRoadmapLoading(false);
      return;
    }

    const data = await res.json();
    setSkillRoadmapResult(data.skillRoadmap || data);
    setSkillRoadmapLoading(false);
  };

  const handleReset = () => {
    setResult(null);
    setStep('input');
    setFile(null);
    setCoverLetterResult(null);
    setSkillRoadmapResult(null);
    setCoverLetterError('');
    setSkillRoadmapError('');
    setActiveTab('gaps');
  };

  if (showUpgrade) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold mb-2">Monthly limit reached</h2>
          <p className="text-zinc-400 mb-6">
            {tier === 'free' && 'Free tier: 2 optimizations/month. Upgrade to Pro for 20/month!'}
            {tier === 'pro' && 'Pro tier: 20 optimizations/month used. Upgrade to Power for 80/month!'}
          </p>
          <Link href="/pricing" className="inline-block bg-red-600 hover:bg-red-700 px-8 py-3 rounded-xl font-bold transition-colors">
            Upgrade Plan →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* HEADER */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-red-500">RoastMyCV</Link>
          <div className="flex items-center gap-3">
            {user ? (
              <span className="text-sm text-zinc-400">{user.email?.split('@')[0]}</span>
            ) : (
              <button onClick={signIn} className="text-sm text-zinc-400 hover:text-white">Sign in</button>
            )}
            <Link href="/roast" className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg font-medium">
              🔥 Roast Mode
            </Link>
            <Link href="/pricing" className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium">
              Pro
            </Link>
          </div>
        </div>
      </header>

      {result ? (
        <ResultView
          result={result}
          onReset={handleReset}
          user={user}
          tier={tier}
          remaining={remaining}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          file={file}
          jobDescription={jobDescription}
          coverLetterResult={coverLetterResult}
          coverLetterLoading={coverLetterLoading}
          coverLetterError={coverLetterError}
          coverLetterTone={coverLetterTone}
          onCoverLetterToneChange={setCoverLetterTone}
          onGenerateCoverLetter={handleGenerateCoverLetter}
          skillRoadmapResult={skillRoadmapResult}
          skillRoadmapLoading={skillRoadmapLoading}
          skillRoadmapError={skillRoadmapError}
          skillsInput={skillsInput}
          onSkillsInputChange={setSkillsInput}
          targetRoleInput={targetRoleInput}
          onTargetRoleChange={setTargetRoleInput}
          onGenerateRoadmap={handleGenerateRoadmap}
        />
      ) : (
        <main className="max-w-3xl mx-auto px-6 py-12">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-black mb-2">📈 Optimize for ATS</h1>
            <p className="text-zinc-400">Upload your resume + paste the job description. Get keywords you&apos;re missing and an ATS-optimized rewrite.</p>
          </div>

          {!user && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-6 text-center">
              <p className="text-zinc-300 mb-3">Sign in to optimize your resume</p>
              <button onClick={signIn} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-semibold">
                Sign in with Google
              </button>
            </div>
          )}

          {/* File upload */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 mb-4">
            <label className="text-sm text-zinc-400 mb-2 block font-medium">Upload Resume (PDF/DOCX)</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-red-500 transition-colors"
            >
              {file ? (
                <p className="text-green-400 font-medium">✓ {file.name}</p>
              ) : (
                <div>
                  <p className="text-3xl mb-2">📄</p>
                  <p className="text-zinc-400">Click to select resume file</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>

          {/* Job description */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 mb-6">
            <label className="text-sm text-zinc-400 mb-2 block font-medium">Paste Job Description</label>
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder="Paste the full job description here..."
              rows={8}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 resize-y"
            />
          </div>

          {error && <p className="text-red-400 mb-4 text-center">{error}</p>}

          <button
            onClick={handleOptimize}
            disabled={!file || !jobDescription.trim() || loading || !user}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white py-4 rounded-xl text-lg font-bold transition-colors"
          >
            {loading ? 'Analyzing + Rewriting...' : 'Optimize for ATS 📈'}
          </button>

          <div className="mt-6 grid grid-cols-3 gap-4 text-center text-sm text-zinc-500">
            <div><p className="text-2xl font-bold text-white">30s</p><p>Processing</p></div>
            <div><p className="text-2xl font-bold text-white">2x</p><p>Free/month</p></div>
            <div><p className="text-2xl font-bold text-white">+57</p><p>Avg score lift</p></div>
          </div>
        </main>
      )}
    </div>
  );
}

function ResultView({
  result, onReset, user, tier, remaining, activeTab, setActiveTab,
  file, jobDescription,
  coverLetterResult, coverLetterLoading, coverLetterError, coverLetterTone, onCoverLetterToneChange,
  onGenerateCoverLetter,
  skillRoadmapResult, skillRoadmapLoading, skillRoadmapError,
  skillsInput, onSkillsInputChange, targetRoleInput, onTargetRoleChange, onGenerateRoadmap,
}: any) {
  const scoreColor = (score: number) =>
    score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  const scoreBg = (score: number) =>
    score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  const gapsFound = result.keywordGaps?.filter((g: KeywordGap) => !g.found) || [];
  const gapsOk = result.keywordGaps?.filter((g: KeywordGap) => g.found) || [];
  const bullets = result.improvedBullets || [];
  const isPro = tier === 'pro' || tier === 'power';

  const handleDownload = async () => {
    const resumeText = result.optimizedResume?.text;
    if (!resumeText) return;
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'optimize',
          resumeText,
          jobTitle: targetRoleInput || 'Resume',
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'optimized-resume.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed. Try again.');
    }
  };

  const tabs = [
    { key: 'gaps', label: `Keyword Gaps (${gapsFound.length})` },
    { key: 'bullets', label: `Improved Bullets (${bullets.length})` },
    { key: 'resume', label: 'Optimized Resume' },
    { key: 'cover-letter', label: 'Cover Letter' },
    { key: 'roadmap', label: 'Skill Roadmap' },
  ];

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      {/* Score comparison */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black mb-6">Your ATS Optimization Result</h1>
        <div className="flex items-center justify-center gap-8 mb-4">
          <div className="text-center">
            <p className="text-sm text-zinc-500 mb-1">Original</p>
            <p className={`text-5xl font-black ${scoreColor(result.originalScore)}`}>{result.originalScore}</p>
          </div>
          <div className="text-3xl text-zinc-600">→</div>
          <div className="text-center">
            <p className="text-sm text-zinc-500 mb-1">Optimized</p>
            <p className={`text-5xl font-black ${scoreColor(result.optimizedScore)}`}>{result.optimizedScore}</p>
          </div>
        </div>
        <div className="h-3 bg-zinc-800 rounded-full max-w-md mx-auto overflow-hidden">
          <div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 rounded-full"
            style={{ width: `${(result.optimizedScore / 100) * 100}%` }} />
        </div>
        <p className="text-emerald-400 font-semibold mt-2">+{result.scoreImprovement} point improvement</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Keyword Gaps Tab */}
      {activeTab === 'gaps' && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <h2 className="font-bold text-lg mb-4">Keyword Analysis</h2>

          {gapsFound.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm text-red-400 font-medium mb-3">❌ Missing Keywords ({gapsFound.length})</h3>
              <div className="space-y-2">
                {gapsFound.slice(0, 15).map((g: KeywordGap, i: number) => (
                  <div key={i} className="bg-red-900/20 border border-red-800/30 rounded-lg p-3 flex items-start justify-between gap-3">
                    <div>
                      <span className="font-semibold text-red-300">{g.keyword}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded ${g.importance === 'critical' ? 'bg-red-800 text-red-200' : g.importance === 'important' ? 'bg-yellow-800 text-yellow-200' : 'bg-zinc-700 text-zinc-300'}`}>
                        {g.importance}
                      </span>
                      {g.suggestedContext && <p className="text-xs text-zinc-400 mt-1">{g.suggestedContext}</p>}
                    </div>
                    <span className="text-red-400 shrink-0 text-lg">✗</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {gapsOk.length > 0 && (
            <div>
              <h3 className="text-sm text-emerald-400 font-medium mb-3">✅ Keywords Found ({gapsOk.length})</h3>
              <div className="flex flex-wrap gap-2">
                {gapsOk.map((g: KeywordGap, i: number) => (
                  <span key={i} className="bg-emerald-900/20 border border-emerald-800/30 text-emerald-300 px-3 py-1.5 rounded-lg text-sm">
                    {g.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Improved Bullets Tab */}
      {activeTab === 'bullets' && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <h2 className="font-bold text-lg mb-4">Improved Bullet Points</h2>
          <div className="space-y-4">
            {bullets.map((b: ImprovedBullet, i: number) => (
              <div key={i} className="border border-zinc-800 rounded-xl overflow-hidden">
                <div className="bg-zinc-800/50 p-4">
                  <p className="text-xs text-red-400 font-medium mb-1">ORIGINAL</p>
                  <p className="text-zinc-400 text-sm">{b.original}</p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-emerald-400 font-medium mb-1">REWRITTEN</p>
                  <p className="text-white text-sm">{b.rewritten}</p>
                  <p className="text-xs text-zinc-500 mt-2 italic">{b.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimized Resume Tab */}
      {activeTab === 'resume' && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">Optimized Resume</h2>
            {isPro && <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Edit Mode</span>}
          </div>
          <ResumeEditor
            initialText={result.optimizedResume?.text || ''}
            readOnly={!isPro}
            onSave={(text) => {
              result.optimizedResume.text = text;
            }}
          />
        </div>
      )}

      {/* Cover Letter Tab */}
      {activeTab === 'cover-letter' && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <h2 className="font-bold text-lg mb-4">✉️ Cover Letter</h2>

          {!coverLetterResult && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">Generate a tailored cover letter for this job application.</p>
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5 font-medium">Tone</label>
                <select value={coverLetterTone} onChange={e => onCoverLetterToneChange(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="professional">Professional</option>
                  <option value="enthusiastic">Enthusiastic</option>
                  <option value="concise">Concise</option>
                </select>
              </div>
              <button onClick={onGenerateCoverLetter} disabled={coverLetterLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-colors">
                {coverLetterLoading ? 'Generating...' : 'Generate Cover Letter'}
              </button>
              {coverLetterError && (
                <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3 text-sm text-red-400">
                  {coverLetterError}
                  {coverLetterError.includes('Upgrade') && (
                    <Link href="/pricing" className="block mt-2 text-emerald-400 hover:underline font-medium">Upgrade →</Link>
                  )}
                </div>
              )}
            </div>
          )}

          {coverLetterResult && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="bg-emerald-900/30 text-emerald-300 text-xs px-2.5 py-1 rounded-full capitalize">
                  {coverLetterResult.tone || coverLetterTone}
                </span>
                <button onClick={() => { onCoverLetterToneChange('professional'); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline">
                  Regenerate
                </button>
              </div>
              {coverLetterResult.subject && (
                <div className="bg-zinc-800/50 rounded-lg p-3 mb-4">
                  <p className="text-xs text-zinc-500 mb-1 font-medium">SUBJECT</p>
                  <p className="text-sm font-semibold text-white">{coverLetterResult.subject}</p>
                </div>
              )}
              <div className="bg-zinc-800/30 rounded-lg p-4">
                {coverLetterResult.body?.split('\n\n').map((p: string, i: number) => (
                  <p key={i} className="text-sm text-zinc-300 leading-relaxed mb-3 last:mb-0">{p}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Skill Roadmap Tab */}
      {activeTab === 'roadmap' && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <h2 className="font-bold text-lg mb-4">🗺️ Skill Roadmap</h2>

          {!skillRoadmapResult && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">Create a personalized learning roadmap to close skill gaps for this role.</p>
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5 font-medium">Your Skills (comma-separated)</label>
                <input type="text" value={skillsInput} onChange={e => onSkillsInputChange(e.target.value)}
                  placeholder="e.g. JavaScript, React, Node.js, Python"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5 font-medium">Target Role</label>
                <input type="text" value={targetRoleInput} onChange={e => onTargetRoleChange(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500" />
              </div>
              <button onClick={onGenerateRoadmap} disabled={skillRoadmapLoading || !skillsInput.trim() || !targetRoleInput.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-colors">
                {skillRoadmapLoading ? 'Generating Roadmap...' : 'Generate Roadmap'}
              </button>
              {skillRoadmapError && (
                <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3 text-sm text-red-400">
                  {skillRoadmapError}
                  {skillRoadmapError.includes('Upgrade') && (
                    <Link href="/pricing" className="block mt-2 text-emerald-400 hover:underline font-medium">Upgrade →</Link>
                  )}
                </div>
              )}
            </div>
          )}

          {skillRoadmapResult && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="bg-purple-900/30 text-purple-300 text-xs px-2.5 py-1 rounded-full">
                    ~{skillRoadmapResult.estimatedTime || 'N/A'}
                  </span>
                </div>
                <button onClick={() => {}}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline">
                  New Roadmap
                </button>
              </div>

              {/* Weekly roadmap */}
              <div className="space-y-3">
                {(skillRoadmapResult.roadmap || []).map((week: any, i: number) => (
                  <div key={i} className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl overflow-hidden">
                    <div className="bg-zinc-800 px-4 py-2.5 flex items-center justify-between">
                      <span className="font-semibold text-sm text-white">Week {week.week}</span>
                      <span className="text-xs text-zinc-400">{week.topic}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {week.project && (
                        <div>
                          <p className="text-xs text-zinc-500 mb-1 font-medium">🛠️ Project</p>
                          <p className="text-sm text-zinc-300">{week.project}</p>
                        </div>
                      )}
                      {week.resources?.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-500 mb-1.5 font-medium">📚 Resources</p>
                          <div className="space-y-1">
                            {week.resources.map((r: any, j: number) => (
                              <a key={j} href={r.url} target="_blank" rel="noopener noreferrer"
                                className="block text-sm text-blue-400 hover:text-blue-300 hover:underline">
                                <span className="text-xs text-zinc-500 mr-1.5">[{r.type}]</span>
                                {r.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {week.skillsCovered?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {week.skillsCovered.map((s: string, j: number) => (
                            <span key={j} className="bg-purple-900/20 text-purple-300 text-xs px-2 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Download / Actions */}
      <div className="text-center mt-8 space-y-3">
        {tier !== 'free' && tier !== 'anon' && (
          <button onClick={handleDownload} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold transition-colors">
            📄 Download Optimized Resume
          </button>
        )}
        {tier === 'free' && (
          <Link href="/pricing" className="inline-block bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-8 py-3 rounded-xl font-semibold text-sm transition-colors">
            Upgrade to Download →
          </Link>
        )}
        <div>
          <button onClick={onReset} className="bg-red-600 hover:bg-red-700 px-8 py-3 rounded-xl font-bold">
            Optimize Another Resume
          </button>
        </div>
        {remaining >= 0 && (
          <p className="text-xs text-zinc-500">{remaining} optimization{remaining !== 1 ? 's' : ''} remaining this month</p>
        )}
      </div>
    </main>
  );
}
