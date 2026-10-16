import { WALL_ID, HEIGHT, getFace, surfacePoint } from '../../../../../packages/config/tianyu-floor-wall';

export type FloorHold = { id: string; serial: string; brand: string; material: string; productType: string; description: string; grip: string; size: string; sizeLabel: string; dimensions: string; price: number; image: string };
export type FloorPlacement = {
  instanceId: string; hold: FloorHold; x: number; y: number; surfaceId?: string;
  rotation: number; scale: number; role: 'manual' | 'start' | 'move' | 'foot' | 'finish';
  roles?: FloorPlacement['role'][]; startLimbs?: ('LH' | 'RH' | 'LF' | 'RF')[];
  step?: number; hand?: 'left' | 'right' | 'both'; technique?: string; routeColor: string;
};
export function serializeFloorDraft(placements: FloorPlacement[], faceId: string) {
  return JSON.stringify({ version: 1, wallId: WALL_ID, savedAt: new Date().toISOString(), faceId,
    placements: placements.map(({ hold, ...point }) => ({ ...point, holdId: hold.id })) }, null, 2);
}
export function parseFloorDraft(text: string, holds: FloorHold[]) {
  if (text.length > 2_000_000) throw new Error('草稿文件超过 2 MB');
  const data = JSON.parse(text);
  if (data.version !== 1 || data.wallId !== WALL_ID || !Array.isArray(data.placements) || data.placements.length > 500)
    throw new Error('不是当前天宇一楼墙面的有效草稿');
  const holdMap = new Map(holds.map(h => [h.id, h])), ids = new Set<string>();
  const placements: FloorPlacement[] = data.placements.map((p: Record<string, unknown>) => {
    const hold = holdMap.get(String(p.holdId));
    if (!hold || typeof p.instanceId !== 'string' || !p.instanceId || ids.has(p.instanceId) || !getFace(String(p.surfaceId))
      || ![p.x, p.y, p.rotation, p.scale].every(v => typeof v === 'number' && Number.isFinite(v))
      || Number(p.x) < 0 || Number(p.x) > 100 || Number(p.y) < 0 || Number(p.y) > 100
      || Number(p.scale) < .25 || Number(p.scale) > 3 || Math.abs(Number(p.rotation)) > 3600
      || !['manual', 'start', 'move', 'foot', 'finish'].includes(String(p.role))) throw new Error('草稿包含不存在的岩点、重复编号或无效坐标');
    ids.add(p.instanceId);
    return { instanceId: p.instanceId, hold, surfaceId: String(p.surfaceId), x: Number(p.x), y: Number(p.y), rotation: Number(p.rotation), scale: Number(p.scale),
      role: p.role as FloorPlacement['role'], routeColor: typeof p.routeColor === 'string' && /^#[\da-f]{6}$/i.test(p.routeColor) ? p.routeColor : '#ff5a36',
      roles: Array.isArray(p.roles) ? p.roles.filter(r => ['manual','start','move','foot','finish'].includes(r)) : undefined,
      startLimbs: Array.isArray(p.startLimbs) ? p.startLimbs.filter(l => ['LH','RH','LF','RF'].includes(l)) : undefined,
      step: typeof p.step === 'number' && Number.isInteger(p.step) && p.step >= 0 && p.step <= 100 ? p.step : undefined,
      hand: ['left', 'right', 'both'].includes(String(p.hand)) ? p.hand as FloorPlacement['hand'] : undefined,
      technique: typeof p.technique === 'string' ? p.technique.slice(0, 120) : undefined };
  });
  return { placements, faceId: getFace(data.faceId)?.kind === 'main' ? data.faceId as string : 'F2' };
}
export function holdDiameterM(hold: FloorHold, scale = 1) {
  // The catalogue is a photo inventory, not individual 3D scans.
  const fallback: Record<string, number> = { XS:.08,S:.12,M:.18,L:.25,XL:.34,XXL:.46,XXXL:.6 };
  const values = (hold.dimensions.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const size = Math.max(0, ...values);
  const measured = /mm/i.test(hold.dimensions) ? size / 1000 : /cm/i.test(hold.dimensions) ? size / 100 : /[×*x]/i.test(hold.dimensions) ? size / (size > 200 ? 1000 : 100) : 0;
  return Math.max(.05, Math.min(1.2, measured || fallback[hold.size] || .25)) * scale;
}

export function fitFloorPoint(hold: FloorHold, point: { surfaceId: string; x: number; y: number }, scale = 1) {
  if (!getFace(point.surfaceId) || ![point.x,point.y,scale].every(Number.isFinite)) throw new Error('无效墙面坐标');
  const radius = holdDiameterM(hold,scale) / 2 + .025;
  const marginY = Math.min(25,radius / HEIGHT * 100), y = Math.max(marginY,Math.min(100-marginY,point.y));
  const a = surfacePoint(point.surfaceId,0,y), b = surfacePoint(point.surfaceId,100,y);
  const width = Math.hypot(...a.map((value,i)=>value-b[i]));
  if (width < radius * 2) throw new Error('这里的连接面太窄，请移到更宽的位置再放置。');
  const marginX = radius / width * 100;
  return { surfaceId:point.surfaceId, x: Math.max(marginX,Math.min(100-marginX,point.x)), y };
}
