import type { ResumeData } from '@/types';
import mammoth from 'mammoth';

/**
 * Extract text from PDF without external libraries.
 * Handles uncompressed and simple compressed PDFs.
 * Falls back to pdfjs-dist for complex PDFs when available.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = buffer.toString('latin1');

  // Try simple extraction first — handle uncompressed PDFs
  if (!data.includes('/Filter')) {
    const text = extractRawText(data);
    if (text.trim().length > 20) return text;
  }

  // Try deflate decompression for simple compressed PDFs
  try {
    const inflated = tryInflate(extractStreams(data));
    if (inflated && inflated.trim().length > 20) return inflated;
  } catch { /* fall through */ }

  // Fallback: use pdfjs-dist for complex PDFs
  try {
    return await extractWithPdfjs(buffer);
  } catch {
    // Last resort: return whatever raw text we can find
    const raw = extractRawText(data);
    if (raw.trim().length > 10) return raw;
    throw new Error('Could not extract text from PDF');
  }
}

function extractRawText(data: string): string {
  // Extract text between parentheses in PDF streams (uncompressed)
  const texts: string[] = [];
  const parenRegex = /\(([^)]*)\)/g;
  let match;
  while ((match = parenRegex.exec(data)) !== null) {
    const t = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
      .replace(/\\(.)/g, '$1');
    if (t.length > 2 && !t.includes('\\')) {
      texts.push(t);
    }
  }
  return texts.join('\n').trim();
}

function extractStreams(data: string): Buffer[] {
  const streams: Buffer[] = [];
  const streamRegex = /stream\s([\s\S]+?)\sendstream/g;
  let match;
  while ((match = streamRegex.exec(data)) !== null) {
    streams.push(Buffer.from(match[1].trim(), 'latin1'));
  }
  return streams;
}

function tryInflate(streams: Buffer[]): string {
  const zlib = require('zlib');
  let text = '';
  for (const stream of streams) {
    try {
      const inflated = zlib.inflateSync(stream);
      text += inflated.toString('utf8');
    } catch { /* stream might not be deflated */ }
  }
  return text;
}

async function extractWithPdfjs(buffer: Buffer): Promise<string> {
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Try to set up worker — may fail in some environments, but getDocument
  // can fall back to main-thread processing for text extraction.
  try {
    const { pathToFileURL } = require('url');
    const path = require('path');
    const workerPath = path.resolve(
      path.dirname(require.resolve('pdfjs-dist/package.json')),
      'legacy/build/pdf.worker.mjs'
    );
    mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  } catch {
    mod.GlobalWorkerOptions.workerSrc = '';
  }

  const doc = await mod.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(' ') + '\n';
  }
  return text;
}

export async function parseResume(buffer: Buffer, mimeType: string): Promise<ResumeData> {
  let text: string;

  if (mimeType === 'application/pdf') {
    text = await extractPdfText(buffer);
  } else {
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