import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-red-500">RoastMyCV</h1>
          <nav className="flex items-center gap-6">
            <Link href="/pricing" className="text-zinc-400 hover:text-white text-sm">Pricing</Link>
            <Link href="/roast" className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
              Roast My CV →
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-20 text-center">
        <section className="mb-16">
          <h2 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
            Drop Your Resume.
            <br />
            <span className="text-red-500">Get Roasted.</span>
          </h2>
          <p className="text-lg text-zinc-400 mb-10 max-w-2xl mx-auto">
            AI-powered resume roast that doesn&apos;t hold back. Brutal honesty on what&apos;s wrong with your CV,
            what recruiters really think, and exactly how to fix it &mdash; all in 30 seconds.
          </p>
          <Link
            href="/roast"
            className="inline-block bg-red-600 hover:bg-red-700 text-white px-10 py-4 rounded-xl text-lg font-bold transition-colors"
          >
            Roast My CV Free
          </Link>
        </section>

        <section className="grid md:grid-cols-3 gap-6 text-left">
          <div className="bg-zinc-800/50 p-6 rounded-xl border border-zinc-700">
            <div className="text-3xl mb-2">🔥</div>
            <h3 className="font-bold mb-2">Brutal Honesty</h3>
            <p className="text-sm text-zinc-400">No sugar-coating. AI tells you exactly what recruiters think when they open your CV.</p>
          </div>
          <div className="bg-zinc-800/50 p-6 rounded-xl border border-zinc-700">
            <div className="text-3xl mb-2">📋</div>
            <h3 className="font-bold mb-2">Action Plan</h3>
            <p className="text-sm text-zinc-400">Not just problems — step-by-step fix plan. Priority-ordered tasks from critical to nice-to-have.</p>
          </div>
          <div className="bg-zinc-800/50 p-6 rounded-xl border border-zinc-700">
            <div className="text-3xl mb-2">⚡</div>
            <h3 className="font-bold mb-2">30 Seconds</h3>
            <p className="text-sm text-zinc-400">Upload PDF/DOCX. Get roasted in under 30s. Free tier: 1 roast/day. Pro: unlimited.</p>
          </div>
        </section>

        <section className="mt-16 py-10 border-t border-zinc-800">
          <p className="text-zinc-500 text-sm">Built for Indian students and job seekers. ₹299/mo Pro — less than a pizza.</p>
        </section>
      </main>
    </div>
  );
}
