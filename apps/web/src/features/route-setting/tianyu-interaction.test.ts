import { describe, expect, it } from 'vitest';
import { pickTianyuPhotoTarget } from './tianyu-interaction';

const targets = [
  { id: 'left', x: 40, y: 50, radius: 1.7 },
  { id: 'right', x: 45, y: 50, radius: 1.7 },
];
const photo = { width: 600, height: 600 };
describe('Tianyu photograph touch selection', () => {
  it('selects the nearest real point instead of the last overlapping button', () => {
    expect(pickTianyuPhotoTarget(targets, { x: 250, y: 300 }, photo, true)?.id).toBe('left');
    expect(pickTianyuPhotoTarget(targets, { x: 262, y: 300 }, photo, true)?.id).toBe('right');
  });
  it('provides a 44px minimum touch diameter without selecting distant background', () => {
    expect(pickTianyuPhotoTarget(targets, { x: 240, y: 321 }, photo, true)?.id).toBe('left');
    expect(pickTianyuPhotoTarget(targets, { x: 240, y: 321 }, photo, false)).toBeNull();
    expect(pickTianyuPhotoTarget(targets, { x: 100, y: 100 }, photo, true)).toBeNull();
  });
  it('scales the point positions when the board is resized or rotated', () => {
    expect(pickTianyuPhotoTarget(targets, { x: 120, y: 150 }, { width: 300, height: 300 }, true)?.id).toBe('left');
    expect(pickTianyuPhotoTarget(targets, { x: 320, y: 300 }, { width: 800, height: 600 }, true)?.id).toBe('left');
  });
  it('rejects off-board taps, zero-sized boards and malformed coordinates', () => {
    for (const tap of [{ x: -1, y: 300 }, { x: 601, y: 300 }, { x: NaN, y: 300 }]) expect(pickTianyuPhotoTarget(targets, tap, photo, true)).toBeNull();
    expect(pickTianyuPhotoTarget(targets, { x: 0, y: 0 }, { width: 0, height: 0 }, true)).toBeNull();
    expect(pickTianyuPhotoTarget([], { x: 240, y: 300 }, photo, true)).toBeNull();
  });
});
