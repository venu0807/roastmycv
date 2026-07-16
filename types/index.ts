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
  severity: 1 | 2 | 3;
  suggestion: string;
}

export interface ActionItem {
  priority: 'critical' | 'high' | 'medium' | 'low';
  area: string;
  task: string;
  details: string;
  resources?: string[];
}
