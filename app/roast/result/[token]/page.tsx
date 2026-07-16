import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface RoastData {
  score: number;
  severity: 'brutal' | 'medium' | 'mild';
  oneLiner: string;
  strengths: string[];
  roastPoints: Array<{
    category: string;
    issue: string;
    severity: 1 | 2 | 3;
    suggestion: string;
  }>;
  actionPlan: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low';
    area: string;
    task: string;
    details: string;
    resources?: string[];
  }>;
  share_token: string;
  watermarked: boolean;
}

async function getRoast(shareToken: string): Promise<RoastData | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set() {},
        remove() {},
      },
    }
  );

  const { data, error } = await supabase
    .from('roasts')
    .select('result_json, share_token, is_watermarked')
    .eq('share_token', shareToken)
    .single();

  if (error || !data) return null;

  const result = data.result_json as RoastData;
  return {
    ...result,
    share_token: data.share_token,
    watermarked: data.is_watermarked,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const roast = await getRoast(token);

  if (!roast) {
    return {
      title: 'Roast Not Found | RoastMyCV',
      description: 'This roast card could not be found or has been removed.',
    };
  }

  const categories = roast.roastPoints.slice(0, 3).map(p => p.category).join(', ');

  const ogImageUrl = `/api/og-image?score=${roast.score}&severity=${roast.severity}&oneLiner=${encodeURIComponent(roast.oneLiner)}&categories=${encodeURIComponent(categories)}`;

  return {
    title: `My Resume Score: ${roast.score}/100 — ${roast.severity} RoastMyCV`,
    description: `"${roast.oneLiner}" — Get your resume roasted by AI.`,
    openGraph: {
      title: `RoastMyCV: ${roast.score}/100 (${roast.severity})`,
      description: `"${roast.oneLiner}" — ${categories}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `RoastMyCV result: ${roast.score}/100` }],
      type: 'website',
      siteName: 'RoastMyCV',
    },
    twitter: {
      card: 'summary_large_image',
      title: `My Resume Roast: ${roast.score}/100`,
      description: `"${roast.oneLiner}" — Brutally honest AI resume review.`,
      images: [ogImageUrl],
    },
  };
}

export default async function ResultPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const roast = await getRoast(token);

  if (!roast) {
    notFound();
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.location.href = "/roast?shared=${token}";
            `,
          }}
        />
      </body>
    </html>
  );
}