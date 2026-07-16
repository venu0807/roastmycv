import type { ResumeData } from '@/types';

export async function parseResume(buffer: Buffer, mimeType: string): Promise<ResumeData> {
  let text: string;

  if (mimeType === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    let fullText = '';
    for (let i = 1; i <= data.numPages; i++) {
      const page = await data.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    text = fullText;
  } else {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  }

  const sections: Record<string, string> = {};
  const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const phones = text.match(/[\+]?[\d-\(\)\s]{10,20}/g) || [];
  const links = text.match(/https?:\/\/[^\s]+/g) || [];

  // Heuristic section extraction
  const sectionHeaders = [
    { key: 'summary', patterns: [/summary/i, /about/i, /profile/i, /objective/i] },
    { key: 'experience', patterns: [/experience/i, /work/i, /employment/i, /history/i] },
    { key: 'education', patterns: [/education/i, /academic/i, /qualification/i] },
    { key: 'skills', patterns: [/skills/i, /technologies/i, /tech stack/i, /expertise/i] },
    { key: 'projects', patterns: [/projects/i, /portfolio/i] },
    { key: 'certifications', patterns: [/certifications?/i, /licenses?/i, /courses?/i] },
  ] as const;

  const lines = text.split('\n');
  let currentSection: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const matched = sectionHeaders.find(({ patterns }) =>
      patterns.some(p => p.test(trimmed.trim().replace(/[^a-zA-Z\s]/g, '')))
    );

    if (matched) {
      currentSection = matched.key;
      continue;
    }

    if (currentSection) {
      sections[currentSection] = (sections[currentSection] || '') + trimmed + '\n';
    }
  }

  // Sanitize output
  text = text.slice(0, 10000);
  for (const key of Object.keys(sections)) {
    if (sections[key]) {
      sections[key] = sections[key]!.slice(0, 5000);
    }
  }

  return { text, sections, emails, phones, links };
}