import { describe, expect, it } from 'vitest';
import { comparableProgress } from './training-utils';
import type { Attempt } from './training-types';
const base = {
  id: 'one',
  athleteId: 'a',
  courseId: 'star-v1',
  type: 'FULL',
  outcome: 'SUCCESS',
  timeMs: 12000,
  timingSource: 'TIMER',
  attemptedAt: '2025-12-01T00:00:00Z',
} as Attempt;
describe('comparable speed records', () => {
  it('excludes different athletes, installation versions, segments and timer sources', () => {
    const rows = [
      base,
      { ...base, id: 'two', timeMs: 14000 },
      { ...base, athleteId: 'b', timeMs: 3000 },
      { ...base, courseId: 'star-v2', timeMs: 4000 },
      { ...base, type: 'SEGMENT', timeMs: 1000 },
      { ...base, timingSource: 'VIDEO', timeMs: 10000 },
    ];
    const stats = comparableProgress(rows, 'a', 'star-v1', 'TIMER');
    expect(stats.timed).toHaveLength(2);
    expect(stats.best).toBe(12000);
    expect(stats.median).toBe(13000);
  });
  it('counts failed attempts in completion rate without zero-second times', () => {
    const stats = comparableProgress(
      [
        base,
        { ...base, outcome: 'FALL', timeMs: null, timingSource: 'NONE' },
        { ...base, outcome: 'UNKNOWN', timeMs: null, timingSource: 'NONE' },
      ],
      'a',
      'star-v1',
      'TIMER',
    );
    expect(stats.completionRate).toBe(50);
    expect(stats.timed).toHaveLength(1);
    expect(stats.unknown).toBe(1);
  });
  it('leaves empty statistics unknown rather than fabricating zeroes', () => {
    const stats = comparableProgress([], 'a', 'c', 'TIMER');
    expect(stats.best).toBeNull();
    expect(stats.median).toBeNull();
    expect(stats.completionRate).toBeNull();
  });
});
