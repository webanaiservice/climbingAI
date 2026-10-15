export type PhotoTarget = { id: string; x: number; y: number; radius: number };

/** Pixel-distance picking avoids overlapping invisible touch buttons on a dense board. */
export function pickTianyuPhotoTarget<T extends PhotoTarget>(
  targets: readonly T[],
  tap: { x: number; y: number },
  photo: { width: number; height: number },
  touch: boolean,
): T | null {
  if (![tap.x, tap.y, photo.width, photo.height].every(Number.isFinite)
    || photo.width <= 0 || photo.height <= 0
    || tap.x < 0 || tap.y < 0 || tap.x > photo.width || tap.y > photo.height) return null;
  let closest: T | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const distance = Math.hypot(target.x * photo.width / 100 - tap.x, target.y * photo.height / 100 - tap.y);
    const radius = Math.max(touch ? 22 : 12, Math.min(44, target.radius * Math.min(photo.width, photo.height) / 100));
    if (distance <= radius && distance < bestDistance) { closest = target; bestDistance = distance; }
  }
  return closest;
}
