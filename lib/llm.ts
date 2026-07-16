import type { ResumeData, RoastResult } from '@/types';
import Groq from 'groq-sdk';
import { z } from 'zod';

function getGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key || key.startsWith('placeholder')) {
    throw new Error('GROQ_API_KEY is not set — add it in Vercel env');
  }
  return new Groq({ apiKey: key });
}

const RoastResultSchema = z.object({
  score: z.number().min(0).max(100),
  severity: z.enum(['brutal', 'medium', 'mild']),
  oneLiner: z.string().min(1).max(500),
  strengths: z.array(z.string().min(1).max(200)).length(3),
  roastPoints: z.array(z.object({
    category: z.enum(['formatting', 'content', 'experience', 'skills', 'education', 'ats']),
    issue: z.string().min(1).max(500),
    severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    suggestion: z.string().min(1).max(500),
  })).min(3).max(10),
  actionPlan: z.array(z.object({
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    area: z.string().min(1).max(100),
    task: z.string().min(1).max(500),
    details: z.string().min(1).max(1000),
    resources: z.array(z.string().url()).optional(),
  })).min(3).max(10),
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

export async function roastResume(resume: ResumeData): Promise<RoastResult> {
  const userPrompt = `Resume text:
---
${resume.text.slice(0, 8000)}
---

Sections found: ${Object.keys(resume.sections).join(', ')}

Roast this. Be brutally honest.`;

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
    const validated = RoastResultSchema.parse(parsed);
    return validated;
  } finally {
    clearTimeout(timeout);
  }
}