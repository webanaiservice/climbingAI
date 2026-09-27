export const trainingSections = [
  { id: 'athletes', label: '运动员档案' },
  { id: 'sessions', label: '训练日志' },
  { id: 'review', label: '视频复盘' },
  { id: 'tasks', label: '训练任务' },
  { id: 'progress', label: '成长报告' },
] as const;

export type TrainingSection = (typeof trainingSections)[number]['id'];

export function trainingSection(value: string | null): TrainingSection {
  return trainingSections.find((section) => section.id === value)?.id ?? 'athletes';
}

export function trainingHref(section: TrainingSection): string {
  return section === 'athletes' ? '/dashboard/training' : `/dashboard/training?tab=${section}`;
}
