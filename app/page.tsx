import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-hidden">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-red-900/20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">R</span>
            </div>
            <span className="text-xl text-white" style={{ fontFamily: "'Righteous', cursive" }}>RoastMyCV</span>
          </Link>
          <div className="flex items-center gap-8">
            <Link href="/pricing" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Pricing
            </Link>
            <Link href="/roast" className="gradient-btn text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-red-500/20">
              Roast My CV →
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <section className="hero-grid-bg pt-32 pb-24 px-6 relative">
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-3xl mx-auto">
              <div className="floating-badge mx-auto w-fit mb-6">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                Brutal AI. Zero sugar-coating.
              </div>

              <h1 className="font-display text-5xl md:text-7xl lg:text-8xl leading-[1.05] mb-6" style={{ fontFamily: "'Righteous', cursive" }}>
                Drop Your Resume.
                <br />
                <span className="text-red-500">Get Roasted.</span>
              </h1>

              <p className="text-lg md:text-xl text-zinc-400 measure mx-auto leading-relaxed mb-10">
                AI-powered resume roast that doesn&apos;t hold back. Brutal honesty on what&apos;s wrong with your CV,
                what recruiters really think, and exactly how to fix it — all in 30 seconds.
              </p>

              <div className="flex flex-wrap gap-4 justify-center">
                <Link href="/roast" className="gradient-btn text-white px-8 py-4 rounded-xl text-lg font-semibold shadow-xl shadow-red-500/25">
                  Roast My CV Free
                </Link>
                <Link href="#how-it-works" className="bg-zinc-800 border border-zinc-700 text-zinc-300 px-8 py-4 rounded-xl text-lg font-semibold hover:border-red-500/50 hover:text-white transition-all">
                  How It Works →
                </Link>
              </div>

              <div className="flex items-center justify-center gap-6 text-sm text-zinc-500 mt-8">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  1 roast/day free
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  30 second analysis
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  PDF & DOCX support
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="border-y border-zinc-800 bg-zinc-900/50">
          <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm">
            <span className="text-zinc-500 font-medium">Trusted by</span>
            <span className="font-semibold text-zinc-300">IIT Delhi</span>
            <span className="w-px h-4 bg-zinc-700 hidden md:block"></span>
            <span className="font-semibold text-zinc-300">NIT Trichy</span>
            <span className="w-px h-4 bg-zinc-700 hidden md:block"></span>
            <span className="font-semibold text-zinc-300">BITS Pilani</span>
            <span className="w-px h-4 bg-zinc-700 hidden md:block"></span>
            <span className="font-semibold text-zinc-300">VIT Vellore</span>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <span className="text-sm font-semibold text-red-500 uppercase tracking-wider">Three steps</span>
              <h2 className="font-display text-4xl md:text-5xl text-white mt-3" style={{ fontFamily: "'Righteous', cursive" }}>Upload. Burn. Fix.</h2>
              <p className="text-zinc-400 mt-4 measure mx-auto">30 seconds from upload to actionable roast. No account needed.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bento-item bg-zinc-900 border border-zinc-800">
                <div className="w-12 h-12 rounded-2xl bg-red-900/30 border border-red-800/30 flex items-center justify-center mb-5">
                  <span className="text-red-500 text-lg" style={{ fontFamily: "'Righteous', cursive" }}>01</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Upload Your CV</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Drop your PDF or DOCX resume. No signup, no email, no spam. We parse your entire CV in seconds.
                </p>
              </div>

              <div className="bento-item bg-zinc-900 border border-zinc-800">
                <div className="w-12 h-12 rounded-2xl bg-orange-900/30 border border-orange-800/30 flex items-center justify-center mb-5">
                  <span className="text-orange-500 text-lg" style={{ fontFamily: "'Righteous', cursive" }}>02</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Get Brutally Roasted</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  AI analyzes formatting, keywords, experience gaps, ATS compatibility, and buzzword density. No punches pulled.
                </p>
              </div>

              <div className="bento-item bg-zinc-900 border border-zinc-800">
                <div className="w-12 h-12 rounded-2xl bg-amber-900/30 border border-amber-800/30 flex items-center justify-center mb-5">
                  <span className="text-amber-500 text-lg" style={{ fontFamily: "'Righteous', cursive" }}>03</span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Fix & Improve</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Priority-ordered action plan covering critical fixes to nice-to-haves. Includes rewrite suggestions for weak sections.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES — Bento */}
        <section className="py-24 px-6 bg-zinc-900/50">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-display text-4xl md:text-5xl text-white" style={{ fontFamily: "'Righteous', cursive" }}>What you get</h2>
            </div>

            <div className="bento-grid">
              <div className="bento-item col-span-12 md:col-span-4 bg-gradient-to-br from-red-950/50 to-red-900/20 border border-red-900/30">
                <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">Brutal Honesty</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">No sugar-coating. AI tells you exactly what recruiters think when they open your CV.</p>
              </div>

              <div className="bento-item col-span-12 md:col-span-4 bg-gradient-to-br from-orange-950/50 to-orange-900/20 border border-orange-900/30">
                <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">ATS Score Check</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">See how your CV performs against automated screeners. Keyword gaps, formatting issues, and section problems flagged.</p>
              </div>

              <div className="bento-item col-span-12 md:col-span-4 bg-gradient-to-br from-amber-950/50 to-amber-900/20 border border-amber-900/30">
                <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">Action Plan</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">Priority-ordered tasks from critical to nice-to-have. Each item has a specific fix you can apply immediately.</p>
              </div>

              <div className="bento-item col-span-12 md:col-span-3 bg-zinc-900 border border-zinc-800">
                <div className="w-10 h-10 rounded-xl bg-zinc-700 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="font-semibold text-white mb-2">Under 30s</h3>
                <p className="text-sm text-zinc-400">Upload PDF/DOCX and get roasted faster than you can make chai. Seriously.</p>
              </div>

              <div className="bento-item col-span-12 md:col-span-3 bg-zinc-900 border border-zinc-800">
                <div className="w-10 h-10 rounded-xl bg-zinc-700 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <h3 className="font-semibold text-white mb-2">100% Private</h3>
                <p className="text-sm text-zinc-400">Your CV is analyzed and auto-deleted. No storage. No training data. No sharing.</p>
              </div>

              <div className="bento-item col-span-12 md:col-span-6 bg-gradient-to-br from-red-900/30 to-zinc-900 border border-red-800/30">
                <div className="w-10 h-10 rounded-xl bg-red-800/50 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="font-semibold text-lg text-white mb-2">Built for Indian Job Market</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">₹299/mo Pro — less than a pizza. Industry-specific analysis for IT, consulting, finance, and core engineering. Hinglish-friendly.</p>
              </div>
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="font-display text-4xl md:text-5xl text-white" style={{ fontFamily: "'Righteous', cursive" }}>Real roasts. Real results.</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="glass-card-light p-8 rounded-2xl">
                <div className="flex gap-1 mb-4"><span className="text-red-400">★</span><span className="text-red-400">★</span><span className="text-red-400">★</span><span className="text-red-400">★</span><span className="text-red-400">★</span></div>
                <p className="text-zinc-300 text-sm leading-relaxed mb-6">
                  "Stung when AI called my resume 'a list of tasks, not achievements.' Rewrote everything. Got 3 interview calls in 2 weeks."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center text-sm font-semibold text-red-400">AP</div>
                  <div>
                    <p className="text-sm font-semibold text-white">Ananya P.</p>
                    <p className="text-xs text-zinc-500">Software Engineer, 2 YOE</p>
                  </div>
                </div>
              </div>

              <div className="glass-card-light p-8 rounded-2xl">
                <div className="flex gap-1 mb-4"><span className="text-red-400">★</span><span className="text-red-400">★</span><span className="text-red-400">★</span><span className="text-red-400">★</span><span className="text-red-400">★</span></div>
                <p className="text-zinc-300 text-sm leading-relaxed mb-6">
                  "Pro feature showed my resume had 34% ATS match. Fixed keywords based on suggestions. Next application got shortlisted."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-900/50 flex items-center justify-center text-sm font-semibold text-orange-400">RK</div>
                  <div>
                    <p className="text-sm font-semibold text-white">Rahul K.</p>
                    <p className="text-xs text-zinc-500">MBA, IIM Ahmedabad</p>
                  </div>
                </div>
              </div>

              <div className="glass-card-light p-8 rounded-2xl">
                <div className="flex gap-1 mb-4"><span className="text-red-400">★</span><span className="text-red-400">★</span><span className="text-red-400">★</span><span className="text-red-400">★</span><span className="text-zinc-600">★</span></div>
                <p className="text-zinc-300 text-sm leading-relaxed mb-6">
                  "Had 5 versions of my CV. RoastMyCV told me which one was best and why. Finally deleted the other 4. Peace of mind."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-900/50 flex items-center justify-center text-sm font-semibold text-amber-400">SM</div>
                  <div>
                    <p className="text-sm font-semibold text-white">Shreya M.</p>
                    <p className="text-xs text-zinc-500">Final Year, BITS Pilani</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6 bg-gradient-to-b from-red-700 to-red-900 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="font-display text-4xl md:text-6xl mb-6" style={{ fontFamily: "'Righteous', cursive" }}>Ready to get roasted?</h2>
            <p className="text-red-200 text-lg mb-10 measure mx-auto">
              Free tier: 1 roast/day. Pro: unlimited roasts, LinkedIn rewrite, ATS score, PDF download — ₹299/mo.
            </p>
            <Link href="/roast" className="gradient-btn inline-block text-white px-10 py-4 rounded-xl text-lg font-semibold shadow-xl shadow-black/20">
              Roast My CV Free →
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-black text-zinc-600 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="text-white text-sm" style={{ fontFamily: "'Righteous', cursive" }}>RoastMyCV</span>
          </div>
          <p className="text-xs text-zinc-600">AI resume analysis for self-improvement. Not a replacement for professional career advice.</p>
          <div className="flex gap-6 text-xs">
            <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
