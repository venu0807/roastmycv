import type { ResumeData, RoastResult, KeywordGap, ImprovedBullet } from '@/types';
import Groq from 'groq-sdk';
import { z } from 'zod';

function getGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key || key.startsWith('placeholder')) {
    throw new Error('GROQ_API_KEY is not set — add it in Vercel env');
  }
  return new Groq({ apiKey: key });
}

const MODEL = 'llama-3.3-70b-versatile';

async function callGroq(systemPrompt: string, userPrompt: string, maxTokens = 2000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s max to fit Vercel 10s limit
  try {
    const completion = await getGroq().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: maxTokens,
    }, { signal: controller.signal });
    const content = completion.choices[0]?.message?.content || '{}';
    console.log('[LLM] Raw response:', content.slice(0, 500));
    return content;
  } catch (e: any) {
    console.error('[LLM] Error:', e.message, e.stack);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

const RoastResultSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  severity: z.enum(['brutal', 'medium', 'mild']),
  oneLiner: z.string().min(1).max(500),
  strengths: z.array(z.string().min(1).max(300)).min(1).max(5),
  roastPoints: z.array(z.object({
    category: z.string().min(1).max(50),
    issue: z.string().min(1).max(500),
    severity: z.number().int().min(1).max(3),
    suggestion: z.string().min(1).max(500),
  })).min(2).max(10),
  actionPlan: z.array(z.object({
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    area: z.string().min(1).max(100),
    task: z.string().min(1).max(500),
    details: z.string().min(1).max(1000),
    resources: z.array(z.string()).max(3).optional(),
  })).min(2).max(10),
});

const SYSTEM_PROMPT = `You are a brutally honest resume reviewer. Your job is to roast the resume hard but end with actionable advice.

Return JSON:
{
  "score": <0-100>,
  "severity": "brutal" | "medium" | "mild",
  "oneLiner": "<one savage line summarizing the resume>",
  "strengths": ["<strength1>", "<strength2>", "<strength3>"],
  "roastPoints": [
    {
      "category": "formatting" | "content" | "experience" | "skills" | "education" | "ats",
      "issue": "<what's wrong>",
      "severity": 1 | 2 | 3,
      "suggestion": "<how to fix>"
    }
  ],
  "actionPlan": [
    {
      "priority": "critical" | "high" | "medium" | "low",
      "area": "<which section>",
      "task": "<specific task>",
      "details": "<why and how>",
      "resources": ["<optional resource link>"]
    }
  ]
}

Be real. If the resume is bad, say it's bad. If it's decent, acknowledge it but still find 5 things to improve. Indian resumes have specific issues: too many irrelevant skills, weak action verbs, missing metrics, poor formatting for ATS. Call those out specifically.`;

// ── ATS Optimization Schemas ─────────────────────────────────────────────

const OptimizeAnalysisSchema = z.object({
  atsScoreBefore: z.number().min(0).max(100),
  keywordGaps: z.array(z.object({
    keyword: z.string().min(1).max(100),
    found: z.boolean(),
    importance: z.enum(['critical', 'important', 'nice-to-have']),
    suggestedContext: z.string().optional(),
  })).min(1).max(30),
  improvedBullets: z.array(z.object({
    original: z.string().min(1).max(500),
    rewritten: z.string().min(1).max(500),
    reason: z.string().min(1).max(300),
  })).min(1).max(15),
  changes: z.array(z.string().min(1).max(300)).min(1).max(15),
});

const OptimizeRewriteSchema = z.object({
  atsScoreAfter: z.number().min(0).max(100),
  optimizedResumeText: z.string().min(10).max(15000),
});

const CoverLetterSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(10).max(5000),
  tone: z.string().min(1).max(50),
});

const SkillRoadmapSchema = z.object({
  estimatedTime: z.string().min(1).max(100),
  roadmap: z.array(z.object({
    week: z.number().int().min(1).max(52),
    topic: z.string().min(1).max(200),
    resources: z.array(z.object({
      title: z.string().min(1).max(200),
      url: z.string().min(1).max(500),
      type: z.string().min(1).max(50),
    })).min(1).max(5),
    project: z.string().min(1).max(500),
    skillsCovered: z.array(z.string().min(1).max(100)).min(1).max(10),
  })).min(2).max(26),
});

// ── ATS Prompts ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT_OPTIMIZE_ANALYZE = `You are an ATS (Applicant Tracking System) expert and resume analyst.

Given a resume and a job description, analyze the resume against the job description:

1. Score the resume 0-100 on ATS compatibility
2. Extract ALL important keywords from the job description and check which ones appear in the resume
3. Identify weak bullet points and rewrite them with strong action verbs + metrics
4. List specific changes needed to improve the ATS score

Return JSON exactly like this:
{
  "atsScoreBefore": <0-100>,
  "keywordGaps": [
    {
      "keyword": "<keyword from JD>",
      "found": true/false,
      "importance": "critical" | "important" | "nice-to-have",
      "suggestedContext": "<where in resume this keyword should be added>"
    }
  ],
  "improvedBullets": [
    {
      "original": "<weak bullet point from resume>",
      "rewritten": "<rewritten version with strong verb + metrics>",
      "reason": "<why the rewrite is better>"
    }
  ],
  "changes": ["<specific change 1>", "<specific change 2>"]
}

Be specific. For each missing keyword, suggest where it should be added. For weak bullets, provide concrete rewrites. Indian resumes often have: irrelevant skills lists, weak action verbs ("Worked on", "Was responsible for"), missing metrics, poor ATS formatting. Call these out.`;

const SYSTEM_PROMPT_OPTIMIZE_REWRITE = `You are an expert resume writer specializing in ATS-optimized resumes.

Given the original resume, job description, and keyword gap analysis, rewrite the ENTIRE resume to:

1. Naturally inject ALL missing critical/important keywords into relevant sections
2. Rewrite weak bullet points with strong action verbs (Built, Implemented, Optimized, Led, Delivered, Architected)
3. Add specific metrics and numbers where possible
4. Ensure proper ATS formatting (standard sections, clean hierarchy, bullet points)
5. Keep the rewritten resume honest — don't fabricate experience

Return JSON:
{
  "atsScoreAfter": <new score 0-100>,
  "optimizedResumeText": "<the complete rewritten resume as plain text with section headers>"
}

Structure the optimized resume with these sections (include only what's relevant):
- Professional Summary
- Skills
- Work Experience (with bullet points)
- Education
- Certifications (if applicable)
- Projects (if applicable)

Each bullet point must start with a strong action verb and include metrics where possible.`;

const SYSTEM_PROMPT_COVER_LETTER = `You are a professional cover letter writer. Given a resume and job description, write a compelling cover letter that highlights the candidate's most relevant experience for the role.

Return JSON:
{
  "subject": "<email subject line>",
  "body": "<full cover letter text with 3-4 paragraphs>",
  "tone": "<professional | enthusiastic | concise>"
}

Keep the body 250-500 words. Use the tone specified. Address the hiring manager naturally. Mention specific skills from the resume that match the job description.`;

const SYSTEM_PROMPT_SKILL_ROADMAP = `You are a career development advisor. Given a set of skills and a target role, create a detailed weekly learning roadmap.

Return JSON:
{
  "estimatedTime": "<total estimated time e.g. '12 weeks'>",
  "roadmap": [
    {
      "week": 1,
      "topic": "<week topic>",
      "resources": [
        { "title": "<resource name>", "url": "<url>", "type": "course|video|article|book|project" }
      ],
      "project": "<hands-on project description>",
      "skillsCovered": ["<skill1>", "<skill2>"]
    }
  ]
}

Each week should have a clear topic, 2-3 learning resources, a practical project, and specific skills covered. Cover foundational → intermediate → advanced progression.`;

export async function roastResume(resume: ResumeData): Promise<RoastResult> {
  const userPrompt = `Resume text:
---
${resume.text.slice(0, 8000)}
---

Sections found: ${Object.keys(resume.sections).join(', ')}

Roast this. Be brutally honest. Respond in JSON format.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000,
    }, { signal: controller.signal });
    const text = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);
    try {
      const validated = RoastResultSchema.parse(parsed);
      return validated;
    } catch (zodErr: any) {
      // LLM returned JSON that doesn't match schema — log details for debugging
      console.error('[LLM] Zod validation failed:', zodErr.message?.slice(0, 300));
      console.error('[LLM] Raw LLM response keys:', Object.keys(parsed));
      // Build a best-effort result from partial data
      const clamp = (n: number) => Math.min(3, Math.max(1, n)) as 1 | 2 | 3;
      return {
        score: typeof parsed.score === 'number' ? Math.min(100, Math.max(0, parsed.score)) : 50,
        severity: (['brutal', 'medium', 'mild'] as const).includes(parsed.severity) ? parsed.severity : 'medium',
        oneLiner: String(parsed.oneLiner || 'Your resume needs work.').slice(0, 500),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5).map((s: any) => String(s).slice(0, 300)) : ['Needs improvement'],
        roastPoints: Array.isArray(parsed.roastPoints) ? parsed.roastPoints.slice(0, 10).map((p: any) => ({
          category: String(p.category || 'formatting').slice(0, 50),
          issue: String(p.issue || 'Area needs improvement').slice(0, 500),
          severity: clamp(Number(p.severity) || 2),
          suggestion: String(p.suggestion || 'Review and revise').slice(0, 500),
        })) : [{ category: 'content', issue: 'Resume needs more detail', severity: 2, suggestion: 'Add specific achievements' }],
        actionPlan: Array.isArray(parsed.actionPlan) ? parsed.actionPlan.slice(0, 10).map((a: any) => ({
          priority: (['critical', 'high', 'medium', 'low'] as const).includes(a.priority) ? a.priority : 'medium',
          area: String(a.area || 'General').slice(0, 100),
          task: String(a.task || 'Improve resume').slice(0, 500),
          details: String(a.details || 'See specific suggestions above').slice(0, 1000),
          resources: Array.isArray(a.resources) ? a.resources.slice(0, 3).map((r: any) => String(r)) : undefined,
        })) : [{ priority: 'medium', area: 'General', task: 'Improve resume content', details: 'Add more achievements and metrics' }],
      } as unknown as RoastResult;
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ── ATS Optimize Functions ──────────────────────────────────────────────

const SYSTEM_PROMPT_OPTIMIZE_COMBINED = `You are an ATS optimization expert and resume writer. Given a resume and a job description:

STEP 1: Analyze the resume against the job description:
- Score the resume 0-100 on ATS compatibility
- Identify ALL important keywords from JD and check which appear in the resume
- Find weak bullet points and rewrite them with strong action verbs + metrics
- List specific changes needed

STEP 2: Rewrite the ENTIRE resume to be ATS-optimized:
- Naturally inject ALL missing critical/important keywords
- Use strong action verbs (Built, Implemented, Optimized, Led, Delivered, Architected)
- Add specific metrics where possible
- Keep it honest — don't fabricate experience
- Proper ATS formatting with section headers

Return JSON exactly like this:
{
  "atsScoreBefore": <0-100>,
  "keywordGaps": [
    { "keyword": "<keyword>", "found": true/false, "importance": "critical|important|nice-to-have", "suggestedContext": "<where to add>" }
  ],
  "improvedBullets": [
    { "original": "<weak bullet>", "rewritten": "<strong bullet with metrics>", "reason": "<why better>" }
  ],
  "changes": ["<change1>", "<change2>"],
  "atsScoreAfter": <0-100>,
  "optimizedResumeText": "<the complete rewritten resume as plain text with section headers>"
}

Structure the optimized resume sections: Professional Summary, Skills, Work Experience (with bullet points), Education, Certifications (if applicable), Projects (if applicable).
Be specific. For missing keywords, suggest where to add them. Indian resumes often have irrelevant skills, weak verbs, missing metrics. Call these out.`;

export async function optimizeResume(
  resume: ResumeData,
  jobDescription: string
): Promise<{
  atsScoreBefore: number;
  atsScoreAfter: number;
  keywordGaps: any[];
  improvedBullets: any[];
  changes: string[];
  optimizedResumeText: string;
}> {
  const userPrompt = `Resume:
---
${resume.text.slice(0, 3000)}
---

JD:
---
${jobDescription.slice(0, 1500)}
---

Sections: ${Object.keys(resume.sections).join(', ')}

ATS optimize + rewrite. JSON only.`;

  const text = await callGroq(SYSTEM_PROMPT_OPTIMIZE_COMBINED, userPrompt, 2500);
  const parsed = JSON.parse(text);

  // Validate and reshape the combined response
  const keywordGaps = Array.isArray(parsed.keywordGaps) ? parsed.keywordGaps.slice(0, 20) : [];
  const improvedBullets = Array.isArray(parsed.improvedBullets) ? parsed.improvedBullets.slice(0, 10) : [];
  const changes = Array.isArray(parsed.changes) ? parsed.changes.slice(0, 10) : [];
  const atsScoreBefore = typeof parsed.atsScoreBefore === 'number' ? Math.min(100, Math.max(0, parsed.atsScoreBefore)) : 50;
  const atsScoreAfter = typeof parsed.atsScoreAfter === 'number' ? Math.min(100, Math.max(0, parsed.atsScoreAfter)) : 70;
  const optimizedResumeText = String(parsed.optimizedResumeText || parsed.optimizedResume || '');

  return {
    atsScoreBefore,
    atsScoreAfter,
    keywordGaps,
    improvedBullets,
    changes,
    optimizedResumeText,
  };
}

export async function analyzeResume(resume: ResumeData, jobDescription: string) {
  const userPrompt = `Resume text:
---
${resume.text.slice(0, 6000)}
---

Job Description:
---
${jobDescription.slice(0, 4000)}
---

Sections found: ${Object.keys(resume.sections).join(', ')}

Analyze this resume against the job description. Respond in JSON format.`;

  const text = await callGroq(SYSTEM_PROMPT_OPTIMIZE_ANALYZE, userPrompt, 2500);
  const parsed = JSON.parse(text);
  return OptimizeAnalysisSchema.parse(parsed);
}

export async function rewriteResume(
  resume: ResumeData,
  jobDescription: string,
  analysis: { keywordGaps: any[]; changes: string[] }
): Promise<{ atsScoreAfter: number; optimizedResumeText: string }> {
  const userPrompt = `Original Resume:
---
${resume.text.slice(0, 4000)}
---

Job Description:
---
${jobDescription.slice(0, 3000)}
---

Missing Keywords to inject: ${analysis.keywordGaps.filter(k => !k.found).map(k => k.keyword).join(', ')}

Changes needed: ${analysis.changes.join('; ')}

Rewrite this resume to be ATS-optimized. Respond in JSON format.`;

  const text = await callGroq(SYSTEM_PROMPT_OPTIMIZE_REWRITE, userPrompt, 3000);
  const parsed = JSON.parse(text);
  return OptimizeRewriteSchema.parse(parsed);
}

export async function generateCoverLetter(
  resume: ResumeData,
  jobDescription: string,
  tone: string = 'professional'
): Promise<{ subject: string; body: string; tone: string }> {
  const userPrompt = `Resume:
---
${resume.text.slice(0, 4000)}
---

Job Description:
---
${jobDescription.slice(0, 3000)}
---

Tone: ${tone}

Write a compelling cover letter. Respond in JSON format.`;

  const text = await callGroq(SYSTEM_PROMPT_COVER_LETTER, userPrompt, 2000);
  const parsed = JSON.parse(text);
  return CoverLetterSchema.parse(parsed);
}

export async function generateSkillRoadmap(
  skills: string[],
  targetRole: string
): Promise<{ estimatedTime: string; roadmap: any[] }> {
  const userPrompt = `Skills: ${skills.join(', ')}

Target Role: ${targetRole}

Current Level: intermediate

Create a detailed weekly learning roadmap. Respond in JSON format.`;

  const text = await callGroq(SYSTEM_PROMPT_SKILL_ROADMAP, userPrompt, 3000);
  const parsed = JSON.parse(text);
  return SkillRoadmapSchema.parse(parsed);
}