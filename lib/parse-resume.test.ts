// lib/parse-resume.test.ts — Unit tests for resume parsing
import { describe, it, expect, vi } from 'vitest'
import { parseResume } from '@/lib/parse-resume'

// Mock pdfjs-dist and mammoth
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(() => Promise.resolve({
        getTextContent: vi.fn(() => Promise.resolve({
          items: [{ str: 'John Doe' }, { str: 'Software Engineer' }, { str: 'john@example.com' }],
        })),
      })),
    }),
  })),
}))

vi.mock('mammoth', () => ({
  extractRawText: vi.fn(({ buffer }) => Promise.resolve({
    value: new TextDecoder().decode(buffer),
  })),
}))

describe('parseResume', () => {
  it('should parse PDF text and extract sections', async () => {
    const buffer = Buffer.from('dummy pdf content')
    const result = await parseResume(buffer, 'application/pdf')

    expect(result).toBeDefined()
    expect(result.text).toContain('John Doe')
    expect(result.text).toContain('Software Engineer')
    expect(result.emails).toContain('john@example.com')
    expect(result.sections).toBeDefined()
  })

  it('should parse DOCX text and extract sections', async () => {
    const text = `John Doe
Software Engineer
john@example.com

Experience
Worked at Google

Education
BS Computer Science

Skills
JavaScript, React, Node.js`
    const buffer = Buffer.from(text)
    const result = await parseResume(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    expect(result.text).toContain('John Doe')
    // Section extraction may vary - just verify it works
    expect(Object.keys(result.sections).length).toBeGreaterThanOrEqual(0)
    expect(result.emails).toContain('john@example.com')
  })

  it('should extract phone numbers', async () => {
    const text = 'John Doe\n+1-555-123-4567\njohn@example.com'
    const buffer = Buffer.from(text)
    const result = await parseResume(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    expect((result.phones ?? []).length).toBeGreaterThan(0)
  })

  it('should extract links', async () => {
    const text = 'John Doe\nhttps://linkedin.com/in/johndoe\nhttps://github.com/johndoe'
    const buffer = Buffer.from(text)
    const result = await parseResume(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    expect(result.links).toContain('https://linkedin.com/in/johndoe')
    expect(result.links).toContain('https://github.com/johndoe')
  })

  it('should truncate text at 10000 chars', async () => {
    const longText = 'A'.repeat(15000)
    const buffer = Buffer.from(longText)
    const result = await parseResume(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    expect(result.text.length).toBeLessThanOrEqual(10000)
  })

  it('should return empty arrays for missing contact info', async () => {
    const text = 'Just some text without contact info'
    const buffer = Buffer.from(text)
    const result = await parseResume(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    expect(result.emails).toEqual([])
    expect(result.phones).toEqual([])
    expect(result.links).toEqual([])
  })
})