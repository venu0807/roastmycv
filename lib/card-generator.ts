import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D } from 'canvas';
import type { RoastResult } from '@/types';

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const MARGIN = 60;

export async function generateRoastCard(
  roast: RoastResult,
  userName?: string
): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background gradient (dark theme matching app)
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, '#0f0f0f');
  gradient.addColorStop(1, '#18181b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Subtle texture
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < CARD_WIDTH; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CARD_HEIGHT);
    ctx.stroke();
  }

  // Left accent bar
  const accentColor = getSeverityColor(roast.severity);
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 8, CARD_HEIGHT);

  // Brand header
  ctx.font = 'bold 20px Inter, system-ui';
  ctx.fillStyle = '#ef4444';
  ctx.textAlign = 'left';
  ctx.fillText('ROASTMYCV', MARGIN, MARGIN + 28);

  ctx.font = '13px Inter, system-ui';
  ctx.fillStyle = '#71717a';
  ctx.fillText('AI Resume Roaster • Llama-3.1-70B', MARGIN, MARGIN + 52);

  // Score circle (center-left)
  const circleX = 300;
  const circleY = 280;
  const radius = 100;

  // Background ring
  ctx.beginPath();
  ctx.arc(circleX, circleY, radius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 12;
  ctx.stroke();

  // Score ring
  const progress = roast.score / 100;
  ctx.beginPath();
  ctx.arc(circleX, circleY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.strokeStyle = getScoreColor(roast.score);
  ctx.stroke();

  // Score number
  ctx.font = 'bold 64px Inter, system-ui';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(roast.score.toString(), circleX, circleY + 22);

  // Severity badge
  const badgeY = circleY + radius + 30;
  const badgeWidth = 200;
  const badgeHeight = 36;
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.roundRect(circleX - badgeWidth / 2, badgeY, badgeWidth, badgeHeight, 18);
  ctx.fill();
  ctx.font = 'bold 14px Inter, system-ui';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(roast.severity.toUpperCase(), circleX, badgeY + 24);

  // One-liner (right side)
  const textX = circleX + radius + 60;
  const textWidth = CARD_WIDTH - textX - MARGIN;

  ctx.font = 'italic 22px Inter, system-ui';
  ctx.fillStyle = '#e4e4e7';
  ctx.textAlign = 'left';
  wrapText(ctx, `"${roast.oneLiner}"`, textX, circleY - 40, textWidth, 32, 3);

  // Top 3 roast points (compact)
  const pointsY = circleY + 60;
  roast.roastPoints.slice(0, 3).forEach((p, i) => {
    const y = pointsY + i * 70;

    // Category badge
    ctx.font = 'bold 11px Inter, system-ui';
    ctx.fillStyle = '#0f0f0f';
    ctx.textAlign = 'left';
    const catText = p.category.toUpperCase();
    const catWidth = ctx.measureText(catText).width + 16;
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(textX, y, catWidth, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(catText, textX + 8, y + 16);

    // Issue
    ctx.font = '16px Inter, system-ui';
    ctx.fillStyle = '#fafafa';
    ctx.textAlign = 'left';
    wrapText(ctx, p.issue, textX, y + 36, textWidth, 24, 2);
  });

  // Footer
  ctx.font = '13px Inter, system-ui';
  ctx.fillStyle = '#71717a';
  ctx.textAlign = 'center';
  ctx.fillText('Get your resume roasted → roastmycv.vercel.app', CARD_WIDTH / 2, CARD_HEIGHT - 30);
  ctx.fillText(`Powered by Llama-3.1-70B on Groq`, CARD_WIDTH / 2, CARD_HEIGHT - 12);

  return canvas.toBuffer('image/png');
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'brutal': return '#ef4444';
    case 'medium': return '#f97316';
    default: return '#22c55e';
  }
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(' ');
  let line = '';
  let lines = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, y);
      line = words[i] + ' ';
      y += lineHeight;
      lines++;
      if (lines >= maxLines) {
        if (i < words.length - 1) {
          ctx.fillText('...', x, y);
        }
        break;
      }
    } else {
      line = testLine;
    }
  }
  if (lines < maxLines) {
    ctx.fillText(line.trim(), x, y);
  }
}

// Quick test
if (require.main === module) {
  const mockRoast = {
    score: 34,
    severity: 'brutal' as const,
    oneLiner: 'Your resume is a wall of text that recruiters will skim for 2 seconds before moving on.',
    strengths: ['Has technical skills listed', 'Shows some project work', 'Includes education details'],
    roastPoints: [
      { category: 'formatting', issue: 'No bullet points — walls of paragraphs. ATS will choke.', severity: 3 as const, suggestion: 'Rewrite experience as bullet points starting with strong action verbs.' },
      { category: 'ats', issue: 'No metrics anywhere. "Worked on..." means nothing without numbers.', severity: 2 as const, suggestion: 'Add metrics: "Reduced load time by 40%", "Managed 5-member team".' },
      { category: 'skills', issue: '17 skills listed. Recruiters read the first 5.', severity: 2 as const, suggestion: 'Trim to 8-10 relevant skills. Add proficiency levels.' },
      { category: 'experience', issue: 'Weak action verbs like "Was responsible for", "Worked on".', severity: 3 as const, suggestion: 'Replace with: Built, Implemented, Optimized, Led, Delivered.' },
    ],
    actionPlan: [],
  };
  generateRoastCard(mockRoast)
    .then(buf => require('fs').writeFileSync('/tmp/test-roast-card.png', buf))
    .then(() => console.log('Test roast card written to /tmp/test-roast-card.png'));
}