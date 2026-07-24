// app/api/download/route.ts — Download roast result or optimized resume
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { RoastResult } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  logger.apiRequest('POST', '/api/download');

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      env.supabaseUrl,
      env.supabaseAnonKey,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value; },
          set(name, value, opts) { cookieStore.set({ name, value, ...opts }); },
          remove(name, opts) { cookieStore.delete({ name, ...opts }); },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    // Check access via consume_download_credit
    const adminClient = createClient(
      env.supabaseUrl,
      env.supabaseServiceRoleKey
    );

    const { data: accessResult } = await adminClient.rpc('consume_download_credit', {
      consume_user_id: user.id,
    });

    if (!accessResult) {
      logger.apiResponse('POST', '/api/download', 402, Date.now() - startTime, { userId: user.id });
      return NextResponse.json({
        error: 'No download credits. Upgrade to Pro for unlimited downloads.',
        upgrade: true,
      }, { status: 402 });
    }

    // Get user's current tier for tier_at_time
    const { data: profile } = await adminClient
      .from('profiles')
      .select('tier')
      .eq('id', user.id)
      .single();

    const body = await req.json();
    const type = body.type || 'roast';

    if (type === 'optimize') {
      // ── Optimized resume download ──────────────────────────────────────
      const resumeText: string = body.resumeText || '';
      const jobTitle: string = body.jobTitle || 'Resume';

      if (!resumeText) {
        return NextResponse.json({ error: 'Missing resume text' }, { status: 400 });
      }

      const html = generateResumeHTML(resumeText, jobTitle);
      const durationMs = Date.now() - startTime;
      logger.apiResponse('POST', '/api/download', 200, durationMs, { userId: user.id, tier: profile?.tier, type: 'optimize' });

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'attachment; filename="optimized-resume.html"',
        },
      });
    }

    // ── Roast report download (default) ──────────────────────────────────
    const roastResult: RoastResult = body.roast;

    // Log download
    if (body.roast_id) {
      await adminClient.from('downloads').insert({
        user_id: user.id,
        roast_id: body.roast_id,
        tier_at_time: profile?.tier || 'free',
      });
    }

    const html = generateReportHTML(roastResult, body.user_name);

    const durationMs = Date.now() - startTime;
    logger.apiResponse('POST', '/api/download', 200, durationMs, { userId: user.id, tier: profile?.tier });

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="roastmycv-report.html"',
      },
    });
  } catch (e: any) {
    logger.apiError('POST', '/api/download', e);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}

function generateResumeHTML(resumeText: string, jobTitle: string): string {
  const lines = resumeText.split('\n');
  const sections: { heading?: string; content: string[] }[] = [];
  let current: { heading?: string; content: string[] } = { content: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('## ') ||
      trimmed.startsWith('# ') ||
      /^[A-Z][A-Z\s\/&]+$/.test(trimmed.replace(/[^A-Z\s\/&-]/g, '')) && trimmed.length > 3 && trimmed.length < 60 ||
      /^(Professional Summary|Work Experience|Education|Skills|Certifications|Projects|Experience|Summary|Technical Skills|Core Competencies|Achievements)$/i.test(trimmed)
    ) {
      if (current.content.length > 0 || current.heading) {
        sections.push(current);
      }
      current = { heading: trimmed.replace(/^#+ /, ''), content: [] };
    } else {
      current.content.push(line);
    }
  }
  if (current.content.length > 0 || current.heading) {
    sections.push(current);
  }

  const sectionHTML = sections.map(s => {
    if (!s.heading && s.content.every(l => !l.trim())) return '';
    const heading = s.heading
      ? `<h2 style="font-size:16px;font-weight:700;color:#ef4444;margin:24px 0 8px 0;padding-bottom:4px;border-bottom:2px solid #27272a;">${escapeHtml(s.heading)}</h2>`
      : '';
    const content = s.content
      .map(l => {
        const t = l.trim();
        if (!t) return '';
        if (t.startsWith('- ') || t.startsWith('• ') || t.startsWith('* ')) {
          return `<li style="margin-bottom:4px;color:#d4d4d8;font-size:13px;line-height:1.5;">${escapeHtml(t.replace(/^[-•*]\s*/, ''))}</li>`;
        }
        if (/^\d+[\.\)]\s/.test(t)) {
          return `<li style="margin-bottom:4px;color:#d4d4d8;font-size:13px;line-height:1.5;">${escapeHtml(t.replace(/^\d+[\.\)]\s*/, ''))}</li>`;
        }
        return `<p style="color:#d4d4d8;font-size:13px;line-height:1.6;margin:0 0 4px 0;">${escapeHtml(t)}</p>`;
      })
      .filter(Boolean)
      .join('');

    if (!heading && !content) return '';

    const wrapperTag = content.includes('<li') ? 'ul' : 'div';
    const wrapperStyle = content.includes('<li')
      ? 'list-style:none;padding:0;margin:0;'
      : '';

    return `
      ${heading}
      <${wrapperTag} style="${wrapperStyle}">${content}</${wrapperTag}>`;
  }).filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Optimized Resume — ${escapeHtml(jobTitle)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #09090b; color: #fafafa; padding: 40px 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 20px; font-weight: 800; color: #ef4444; margin-bottom: 4px; }
    .job-title { font-size: 14px; color: #a1a1aa; }

    @media print {
      body { background: #fff; color: #111; padding: 0; }
      .logo { color: #dc2626; }
      .job-title { color: #52525b; }
      h2 { color: #dc2626 !important; border-bottom-color: #e4e4e7 !important; }
      p, li { color: #27272a !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">RoastMyCV</div>
      <p style="color:#71717a;font-size:12px;margin-bottom:8px;">Optimized Resume</p>
      <p class="job-title">${escapeHtml(jobTitle)}</p>
    </div>
    ${sectionHTML}

    <div style="text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #27272a;font-size:12px;color:#52525b;">
      <p>Optimized by RoastMyCV — roastmycv.vercel.app</p>
    </div>
  </div>
</body>
</html>`;
}

function generateReportHTML(roast: RoastResult, userName?: string): string {
  const scoreColor = roast.score >= 70 ? '#22c55e' : roast.score >= 40 ? '#eab308' : '#ef4444';
  const severityLabel = roast.severity === 'brutal' ? '🔥 Brutal' : roast.severity === 'medium' ? '⚠️ Medium' : '✅ Mild';

  const strengthsList = roast.strengths.map(s =>
    `<li style="padding:10px 14px;background:#18181b;border-radius:8px;color:#d4d4d8;margin-bottom:8px;font-size:14px;">✓ ${escapeHtml(s)}</li>`
  ).join('');

  const roastPointsList = roast.roastPoints.map(p =>
    `<div style="background:#18181b;border-radius:10px;padding:16px;margin-bottom:12px;border-left:4px solid #ef4444;">
      <div style="display:flex;gap:8px;margin-bottom:6px;">
        <span style="font-size:11px;background:#27272a;padding:3px 8px;border-radius:4px;color:#a1a1aa;">${escapeHtml(p.category)}</span>
        <span style="font-size:11px;">${'🔥'.repeat(p.severity)}</span>
      </div>
      <p style="font-weight:600;margin:0 0 4px 0;font-size:15px;">${escapeHtml(p.issue)}</p>
      <p style="font-size:13px;color:#a1a1aa;margin:0;">${escapeHtml(p.suggestion)}</p>
    </div>`
  ).join('');

  const actionPlanList = roast.actionPlan.map(a =>
    `<div style="background:#18181b;border-radius:10px;padding:16px;margin-bottom:10px;">
      <div style="display:flex;gap:8px;margin-bottom:4px;">
        <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${a.priority === 'critical' ? '#450a0a' : a.priority === 'high' ? '#422006' : '#27272a'};color:${a.priority === 'critical' ? '#fca5a5' : a.priority === 'high' ? '#fde047' : '#a1a1aa'};">${escapeHtml(a.priority)}</span>
        <span style="font-size:11px;color:#71717a;">${escapeHtml(a.area)}</span>
      </div>
      <p style="font-weight:600;margin:0 0 2px 0;font-size:14px;">${escapeHtml(a.task)}</p>
      <p style="font-size:13px;color:#a1a1aa;margin:0;">${escapeHtml(a.details)}</p>
    </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RoastMyCV Report${userName ? ` — ${escapeHtml(userName)}` : ''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #09090b; color: #fafafa; padding: 40px 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 28px; font-weight: 800; color: #ef4444; margin-bottom: 4px; }
    .score-circle { display: inline-flex; align-items: center; justify-content: center;
      width: 140px; height: 140px; border-radius: 50%;
      background: conic-gradient(${scoreColor} ${roast.score * 3.6}deg, rgba(255,255,255,0.06) 0);
      margin: 20px auto; position: relative; }
    .score-circle-inner { width: 116px; height: 116px; border-radius: 50%;
      background: #09090b; display: flex; align-items: center; justify-content: center; }
    .score-number { font-size: 48px; font-weight: 800; color: ${scoreColor}; }
    .one-liner { font-style: italic; color: #a1a1aa; font-size: 16px; margin: 12px 0; }
    .severity { font-size: 13px; color: ${scoreColor}; }
    section { margin-bottom: 32px; }
    h2 { font-size: 18px; font-weight: 700; margin-bottom: 14px; }
    ul { list-style: none; padding: 0; }

    @media print {
      body { background: #fff; color: #111; padding: 0; }
      .score-circle { break-inside: avoid; }
      div { break-inside: avoid; }
      .one-liner { color: #52525b; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">RoastMyCV</div>
      <p style="color:#71717a;font-size:13px;">AI Resume Analysis Report</p>
      ${userName ? `<p style="color:#a1a1aa;font-size:14px;margin-top:8px;">${escapeHtml(userName)}</p>` : ''}

      <div class="score-circle">
        <div class="score-circle-inner">
          <span class="score-number">${roast.score}</span>
        </div>
      </div>
      <p class="one-liner">"${escapeHtml(roast.oneLiner)}"</p>
      <p class="severity">${severityLabel}</p>
    </div>

    <section>
      <h2>✅ Strengths</h2>
      <ul>${strengthsList}</ul>
    </section>

    <section>
      <h2 style="color:#ef4444;">🔥 Roast Points</h2>
      ${roastPointsList}
    </section>

    ${roast.actionPlan.length ? `
    <section>
      <h2 style="color:#4ade80;">📋 Action Plan</h2>
      ${actionPlanList}
    </section>` : ''}

    <div style="text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #27272a;font-size:12px;color:#52525b;">
      <p>Generated by RoastMyCV — roastmycv.vercel.app</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
