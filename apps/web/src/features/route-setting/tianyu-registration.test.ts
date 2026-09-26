import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attachTianyuRegistration, normalizeTianyuHolds, mergeTianyuReview,
  tianyuRegistrationStatus, tianyuAssetDescription,
  type TianyuRegistrationReport, type TianyuHold,
} from './tianyu-board';

const seed = JSON.parse(readFileSync(new URL('../../../public/data/tianyu-reviewed-holds.json', import.meta.url), 'utf8'));
const report = JSON.parse(readFileSync(new URL('../../../public/data/tianyu-registration-r1.json', import.meta.url), 'utf8')) as TianyuRegistrationReport;
const holds = normalizeTianyuHolds(seed.holds);
const linked = attachTianyuRegistration(holds, report);

describe('Tianyu photo/GLB associations', () => {
  it('links every existing identity without changing photo annotations or selection confirmation', () => {
    expect(Object.keys(report.points).sort()).toEqual(holds.map((point) => point.id).sort());
    expect(linked).toHaveLength(264);
    for (let i = 0; i < holds.length; i++) {
      const { registration, ...point } = linked[i];
      expect(point).toEqual(holds[i]);
      expect(registration).toBeDefined();
      expect(point.confirmed).toBe(true);
    }
  });

  it('round-trips source triangles and explicitly omits geometry for unscanned points', () => {
    const restored = normalizeTianyuHolds(JSON.parse(JSON.stringify(linked)));
    const counts = { registered: 0, uncertain: 0, missing: 0 };
    for (const hold of restored) {
      const geometry = hold.registration!;
      counts[geometry.status]++;
      if (geometry.status === 'missing') {
        expect(geometry.surfacePoint).toBeUndefined();
        expect(geometry.faceIndex).toBeUndefined();
      } else if (geometry.surfacePoint) {
        expect(geometry.barycentric!.reduce((sum, n) => sum + n, 0)).toBeCloseTo(1, 5);
        expect(geometry.barycentric!.every((n) => n >= -1e-6)).toBe(true);
      }
    }
    expect(counts).toEqual(report.counts);
  });

  it('preserves moves, deletions, manual additions and an intentionally empty board', () => {
    const moved = { ...holds[1], x: holds[1].x + 0.5, humanEdited: true, notes: '人工备注' };
    const custom: TianyuHold = { ...holds[2], id: 'manual-new', source: 'manual', x: 51 };
    const saved = [holds[0], moved, custom];
    const before = JSON.stringify(saved);
    const result = attachTianyuRegistration(saved, report);
    expect(result.map((p) => p.id)).toEqual(saved.map((p) => p.id));
    expect(result[1].x).toBe(moved.x);
    expect(result[1].notes).toBe('人工备注');
    expect(tianyuRegistrationStatus(result[1])).toBe('moved');
    expect(tianyuRegistrationStatus(result[2])).toBe('unregistered');
    expect(attachTianyuRegistration([], report)).toEqual([]);
    expect(JSON.stringify(saved)).toBe(before);
  });

  it('does not invalidate geometric links for text edits but stops advertising moved coordinates', () => {
    const point = linked.find((h) => h.registration?.status === 'registered')!;
    const revised = { ...point, grip: '捏点', humanEdited: true };
    expect(tianyuRegistrationStatus(revised)).toBe('registered');
    expect(tianyuAssetDescription(revised)).toContain('表面已配准');
    expect(tianyuAssetDescription({ ...revised, x: revised.x + .01 })).toContain('原三维配准已失效');
    expect(tianyuAssetDescription({ ...revised, x: revised.x + .01 })).not.toContain('表面已配准');
  });

  it('retains metadata after the pre-GPT6 storage migration and rejects malformed geometry', () => {
    const migrated = mergeTianyuReview(normalizeTianyuHolds(seed.legacyHolds), normalizeTianyuHolds(seed.legacyHolds), linked);
    expect(attachTianyuRegistration(migrated, report).every((point) => point.registration)).toBe(true);
    const point = linked.find((h) => h.registration?.status === 'registered')!;
    expect(normalizeTianyuHolds([{ ...point, registration: { ...point.registration, surfacePoint: [NaN, 0, 0] } }])[0].registration).toBeUndefined();
  });
});
