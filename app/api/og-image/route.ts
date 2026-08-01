import { NextRequest, NextResponse } from 'next/server';
import { generateRoastCard } from '@/lib/card-generator';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const score = parseInt(searchParams.get('score') || '50', 10);
    const severity = searchParams.get('severity') || 'medium';
    const oneLiner = searchParams.get('oneLiner') || 'Your resume needs work.';
    const categories = searchParams.get('categories') || 'formatting,ats,skills';

    const mockRoast = {
      score,
      severity: severity as 'brutal' | 'medium' | 'mild',
      oneLiner,
      strengths: [],
      roastPoints: categories.split(',').map((cat, i) => ({
        category: cat.trim(),
        issue: `Issue with ${cat.trim()}`,
        severity: (i % 3) + 1 as 1 | 2 | 3,
        suggestion: `Fix your ${cat.trim()}`,
      })),
      actionPlan: [],
    };

    const buffer = await generateRoastCard(mockRoast);

    const uint8Array = new Uint8Array(buffer);
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Roast OG image error:', error);
    return new NextResponse('Error generating image', { status: 500 });
  }
}