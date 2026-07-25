export interface ResumeData {
  text: string;
  sections: Record<string, string | undefined>;
  emails?: string[];
  phones?: string[];
  links?: string[];
}

export interface RoastResult {
  score: number;
  severity: 'brutal' | 'medium' | 'mild';
  oneLiner: string;
  strengths: string[];
  roastPoints: RoastPoint[];
  actionPlan: ActionItem[];
}

export interface RoastPoint {
  category: string;
  issue: string;
  severity: number;
  suggestion: string;
}

export interface ActionItem {
  priority: 'critical' | 'high' | 'medium' | 'low';
  area: string;
  task: string;
  details: string;
  resources?: string[];
}

// ── New types for HireRaft-style features ─────────────────────────────────

export interface KeywordGap {
  keyword: string;
  found: boolean;
  importance: 'critical' | 'important' | 'nice-to-have';
  suggestedContext?: string;
}

export interface ImprovedBullet {
  original: string;
  rewritten: string;
  reason: string;
}

export interface OptimizeResult {
  atsScoreBefore: number;
  atsScoreAfter: number;
  keywordGaps: KeywordGap[];
  optimizedResumeText: string;
  originalResumeText: string;
  improvedBullets: ImprovedBullet[];
  changes: string[];
}

export interface CoverLetterResult {
  subject: string;
  body: string;
  tone: string;
  length: number;
}

export interface SkillRoadmapItem {
  week: number;
  topic: string;
  resources: { title: string; url: string; type: string }[];
  project: string;
  skillsCovered: string[];
}

export interface SkillRoadmapResult {
  skill: string;
  targetRole: string;
  currentLevel: string;
  estimatedTime: string;
  roadmap: SkillRoadmapItem[];
}

export interface OptimizationHistoryItem {
  id: string;
  type: 'optimize' | 'roast';
  originalScore: number | null;
  optimizedScore: number | null;
  score: number | null;
  keywordGapCount: number | null;
  jobTitle: string | null;
  company: string | null;
  createdAt: string;
  shareToken: string;
  previewSnippet: string;
}
