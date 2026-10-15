import type { TianyuHold } from './tianyu-board';

export type RouteLimb = 'LH' | 'RH' | 'LF' | 'RF';
export type RoutePointRole = 'move' | 'foot' | 'finish';
export type TianyuRoutePoint = { holdId: string; roles: RoutePointRole[]; startLimbs: RouteLimb[] };
export type TianyuRouteMove = { id: string; holdId: string; hand: 'left' | 'right' | 'both'; technique: string; note: string };
export type TianyuRouteDocument = {
  version: 1;
  name: string;
  grade: string;
  notes: string;
  board: { id: 'TY-01'; revision: string; angle: number; holds: TianyuHold[] };
  points: TianyuRoutePoint[];
  moves: TianyuRouteMove[];
  origin: {
    kind: 'manual' | 'ai-assisted';
    generationSource?: 'ai' | 'local-fallback';
    model?: string;
    prompt?: string;
    candidateTitle?: string;
    initialPoints?: TianyuRoutePoint[];
    initialMoves?: TianyuRouteMove[];
  };
};
export type TianyuRouteEditorState = { id?: string; revision?: number; dirty: boolean; document: TianyuRouteDocument };
export type SavedTianyuRoute = { id: string; revision: number; name: string; grade: string; angle: number; updatedAt: string; document: TianyuRouteDocument };
export type TianyuRouteSummary = Omit<SavedTianyuRoute, 'document'>;

export function newTianyuRoute(holds: TianyuHold[], angle: number, revision: string): TianyuRouteDocument {
  return {
    version: 1, name: '未命名线路', grade: 'V4', notes: '',
    board: { id: 'TY-01', revision, angle, holds: holds.map(({ registration: _registration, ...hold }) => ({ ...hold })) },
    points: [], moves: [], origin: { kind: 'manual' },
  };
}

const moveId = () => globalThis.crypto.randomUUID();

export function addRoutePoint(doc: TianyuRouteDocument, holdId: string): TianyuRouteDocument {
  if (doc.points.some(p => p.holdId === holdId) || !doc.board.holds.some(p => p.id === holdId && p.confirmed)) return doc;
  return { ...doc, points: [...doc.points, { holdId, roles: ['move'], startLimbs: [] }],
    moves: [...doc.moves, { id: moveId(), holdId, hand: doc.moves.length % 2 ? 'right' : 'left', technique: 'static', note: '' }] };
}

export function removeRoutePoint(doc: TianyuRouteDocument, holdId: string): TianyuRouteDocument {
  return { ...doc, points: doc.points.filter(p => p.holdId !== holdId), moves: doc.moves.filter(m => m.holdId !== holdId) };
}

export function setRouteRole(doc: TianyuRouteDocument, holdId: string, role: RoutePointRole, enabled: boolean): TianyuRouteDocument {
  const points = doc.points.map(p => p.holdId !== holdId ? p : { ...p, roles: enabled ? [...new Set([...p.roles, role])] : p.roles.filter(r => r !== role) });
  const selected = points.find(p => p.holdId === holdId);
  const usesHands = selected?.roles.some(r => r === 'move' || r === 'finish');
  let moves = doc.moves;
  if (!usesHands) moves = moves.filter(m => m.holdId !== holdId);
  else if (!moves.some(m => m.holdId === holdId)) moves = [...moves, { id: moveId(), holdId, hand: 'left', technique: 'static', note: '' }];
  return { ...doc, points, moves };
}

export function assignStartLimb(doc: TianyuRouteDocument, holdId: string, limb: RouteLimb): TianyuRouteDocument {
  const remove = doc.points.find(p => p.holdId === holdId)?.startLimbs.includes(limb);
  const hand = limb === 'LH' || limb === 'RH';
  return { ...doc,
    points: doc.points.map(p => {
      const startLimbs = p.startLimbs.filter(value => value !== limb);
      if (p.holdId === holdId && !remove) startLimbs.push(limb);
      return { ...p, startLimbs,
        roles: p.holdId === holdId && !remove ? p.roles.filter(r => r !== 'move').concat(!hand && !p.roles.includes('foot') ? ['foot'] : []) : p.roles };
    }),
    moves: !remove ? doc.moves.filter(m => m.holdId !== holdId) : doc.moves,
  };
}

export function appendRouteMove(doc: TianyuRouteDocument, holdId: string): TianyuRouteDocument {
  const point = doc.points.find(p => p.holdId === holdId);
  if (!point) return doc;
  return { ...doc, points: doc.points.map(p => p.holdId !== holdId ? p : { ...p, roles: [...new Set<RoutePointRole>([...p.roles, 'move'])] }),
    moves: [...doc.moves, { id: moveId(), holdId, hand: doc.moves.at(-1)?.hand === 'left' ? 'right' : 'left', technique: 'static', note: '' }] };
}

export function moveRouteAction(doc: TianyuRouteDocument, index: number, direction: -1 | 1): TianyuRouteDocument {
  const next = index + direction;
  if (next < 0 || next >= doc.moves.length) return doc;
  const moves = [...doc.moves];
  [moves[index], moves[next]] = [moves[next], moves[index]];
  return { ...doc, moves };
}

export function routeDraftWarnings(doc: TianyuRouteDocument): string[] {
  const issues: string[] = [];
  if (!doc.points.length) issues.push('尚未选择线路点');
  const starts = doc.points.filter(p => p.startLimbs.length);
  const assigned = starts.flatMap(p => p.startLimbs);
  if (!(['LH', 'RH', 'LF', 'RF'] as const).every(limb => assigned.includes(limb))) issues.push('起步还需明确左手、右手、左脚、右脚');
  const feet = starts.filter(p => p.startLimbs.some(l => l === 'LF' || l === 'RF'));
  const hands = starts.filter(p => p.startLimbs.some(l => l === 'LH' || l === 'RH'));
  if (![3, 4].includes(starts.length) || feet.length !== 2 || ![1, 2].includes(hands.length) || feet.some(p => p.startLimbs.some(l => l === 'LH' || l === 'RH'))) issues.push('起步应为两个独立脚点 + 一至两个独立手点');
  if (!doc.points.some(p => p.roles.includes('finish'))) issues.push('尚未指定终点');
  if (doc.points.some(p => !p.roles.length && !p.startLimbs.length)) issues.push('部分线路点尚未设置用途');
  if (!doc.moves.length) issues.push('尚未记录起步后的手部动作');
  const finish = doc.points.filter(p => p.roles.includes('finish')).map(p => p.holdId);
  if (doc.moves.length && !finish.includes(doc.moves.at(-1)!.holdId)) issues.push('最后一个动作尚未到达终点');
  if (doc.points.some(p => (p.roles.includes('move') || p.roles.includes('finish')) && !doc.moves.some(m => m.holdId === p.holdId))) issues.push('部分手点或终点尚未编入动作顺序');
  return issues;
}

type CandidatePoint = { instanceId: string; role: string; roles?: string[]; startLimbs?: RouteLimb[]; step?: number; hand?: 'left' | 'right' | 'both'; technique?: string };
export function routeFromCandidate(holds: TianyuHold[], angle: number, revision: string,
  candidate: { title: string; grade: string; placements: CandidatePoint[]; metrics?: { beta: Array<{ targetInstanceId?: string; hand: 'left' | 'right'; technique: string }> } }, model: string, prompt: string, generationSource: 'ai' | 'local-fallback' = 'ai'): TianyuRouteDocument {
  const doc = newTianyuRoute(holds, angle, revision);
  const used = new Set<string>();
  const known = new Set(holds.filter(p => p.confirmed).map(p => p.id));
  const points: TianyuRoutePoint[] = candidate.placements.flatMap(p => {
    if (!known.has(p.instanceId) || used.has(p.instanceId)) return [];
    used.add(p.instanceId);
    const roles = [...new Set([p.role, ...(p.roles ?? [])])].filter((r): r is RoutePointRole => ['move', 'foot', 'finish'].includes(r));
    return [{ holdId: p.instanceId, roles, startLimbs: [...(p.startLimbs ?? [])] }];
  });
  const beta = candidate.metrics?.beta ?? [];
  const betaMoves = beta.flatMap(step => !step.targetInstanceId || !used.has(step.targetInstanceId) ? [] : [{ id: moveId(), holdId: step.targetInstanceId, hand: step.hand, technique: step.technique, note: '' }]);
  const moves = betaMoves.length === beta.length && betaMoves.length ? betaMoves : candidate.placements.filter(p => points.some(point => point.holdId === p.instanceId && point.roles.some(r => r === 'move' || r === 'finish')) && (p.step ?? 0) > 0)
    .sort((a, b) => (a.step ?? 0) - (b.step ?? 0)).map(p => ({ id: moveId(), holdId: p.instanceId, hand: p.hand ?? 'left', technique: p.technique ?? 'static', note: '' }));
  return { ...doc, name: candidate.title, grade: candidate.grade, points, moves,
    origin: { kind: 'ai-assisted', generationSource, model, prompt, candidateTitle: candidate.title, initialPoints: structuredClone(points), initialMoves: structuredClone(moves) } };
}
