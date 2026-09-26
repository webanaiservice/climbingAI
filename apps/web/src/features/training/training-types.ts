export interface Measurement {
  id: string;
  measuredAt: string;
  heightCm: number | null;
  weightKg: number | null;
  armSpanCm: number | null;
  testName: string;
  testResult: string;
  notes: string;
}
export interface Athlete {
  id: string;
  name: string;
  birthDate: string | null;
  trainingSince: string | null;
  coachName: string;
  groupName: string;
  goal: string;
  notes: string;
  archived: boolean;
  measurements: Measurement[];
}
export interface Course {
  id: string;
  name: string;
  kind: 'STAR' | 'BIRD';
  version: string;
  standardReference: string;
  notes: string;
}
export interface Session {
  id: string;
  athleteId: string;
  trainedAt: string;
  focus: string;
  category: string;
  durationMinutes: number;
  fatigue: number | null;
  painNote: string;
  actualWork: string;
  notes: string;
}
export interface Review {
  id: string;
  decision: 'APPROVED' | 'REJECTED';
  comment: string;
  createdAt: string;
}
export interface Finding {
  title: string;
  observation: string;
  hypothesis: string;
  startSeconds: number;
  endSeconds: number;
  evidence: 'CLEAR' | 'LIMITED';
  suggestion: string;
  criterion: string;
}
export interface Report {
  summary: string;
  strengths: string[];
  limitations: string[];
  findings: Finding[];
}
export interface Analysis {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED';
  model?: string;
  report?: Report | null;
  error?: string | null;
  createdAt?: string;
  reviews: Review[];
}
export interface Attempt {
  id: string;
  athleteId: string;
  courseId: string;
  sessionId: string | null;
  attemptedAt: string;
  lane: string;
  type: string;
  outcome: string;
  timeMs: number | null;
  timingSource: string;
  targetDescription: string;
  notes: string;
  events: { label: string; timeMs: number }[];
  video: { id: string; filename: string; durationMs: number } | null;
  analyses: Analysis[];
}
export interface Task {
  id: string;
  athleteId: string;
  analysisId: string | null;
  title: string;
  instructions: string;
  criterion: string;
  dueAt: string | null;
  status: string;
  retestAttemptId: string | null;
  resultNote: string;
}
export interface Workspace {
  athletes: Athlete[];
  courses: Course[];
  sessions: Session[];
  attempts: Attempt[];
  tasks: Task[];
  totalAttempts: number;
  ai: { enabled: boolean; model: string; models: { id: string; label: string }[] };
  limits: { attempts: number; sessions: number };
}
export type Tab = 'athletes' | 'sessions' | 'review' | 'tasks' | 'progress';
export interface FormState {
  kind: 'athlete' | 'measurement' | 'course' | 'session' | 'attempt' | 'task' | 'retest';
  athleteId?: string;
  athlete?: Athlete;
  attempt?: Attempt;
  task?: Task;
  analysisId?: string;
  finding?: Finding;
  courseKind?: 'STAR' | 'BIRD';
}
export const outcomes: Record<string, string> = {
  SUCCESS: '有效完攀',
  FALL: '脱落',
  ABORTED: '主动结束',
  UNKNOWN: '待确认',
};
export const timingSources: Record<string, string> = {
  TIMER: '电子计时',
  VIDEO: '视频估时',
  MANUAL: '人工秒表',
  NONE: '未记录',
};
export const categories: Record<string, string> = {
  TECHNIQUE: '技术练习',
  SPEED: '速度训练',
  CONDITIONING: '基础体能',
  COMPETITION: '比赛',
};
export const taskStatuses: Record<string, string> = {
  TODO: '待安排',
  PRACTICING: '练习中',
  RETEST: '待复测',
  IMPROVED: '已有改善',
  NO_CHANGE: '尚未改善',
};
