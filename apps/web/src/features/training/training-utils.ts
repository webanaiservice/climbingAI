import type { Attempt } from './training-types';
export function localDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function dateLabel(value?: string | null) {
  return value
    ? new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
    : '未记录';
}
export function ageLabel(birth?: string | null) {
  if (!birth) return '年龄待补充';
  const now = new Date();
  const date = new Date(birth);
  const months =
    (now.getFullYear() - date.getUTCFullYear()) * 12 +
    now.getMonth() -
    date.getUTCMonth() -
    (now.getDate() < date.getUTCDate() ? 1 : 0);
  return `${Math.floor(months / 12)}岁${months % 12 ? `${months % 12}个月` : ''}`;
}
export function secondsLabel(ms?: number | null) {
  return ms == null ? '—' : (ms / 1000).toFixed(2);
}
export function comparableProgress(
  attempts: Attempt[],
  athleteId: string,
  courseId: string,
  timingSource: string,
) {
  const rows = attempts.filter(
    (a) => a.athleteId === athleteId && a.courseId === courseId && a.type === 'FULL',
  );
  const known = rows.filter((a) => a.outcome !== 'UNKNOWN');
  const success = rows.filter((a) => a.outcome === 'SUCCESS');
  const timed = success
    .filter((a) => a.timeMs != null && a.timingSource === timingSource)
    .sort((a, b) => Date.parse(a.attemptedAt) - Date.parse(b.attemptedAt));
  const sorted = timed.map((a) => a.timeMs!).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    rows,
    known,
    success,
    timed,
    best: sorted[0] ?? null,
    median: sorted.length
      ? sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
      : null,
    completionRate: known.length ? Math.round((success.length / known.length) * 100) : null,
    unknown: rows.length - known.length,
  };
}
