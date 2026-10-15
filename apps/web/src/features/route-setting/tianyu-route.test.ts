import { describe, expect, it } from 'vitest';
import { addRoutePoint, appendRouteMove, assignStartLimb, moveRouteAction, newTianyuRoute, removeRoutePoint, routeDraftWarnings, routeFromCandidate, setRouteRole } from './tianyu-route';
import type { TianyuHold } from './tianyu-board';

const holds: TianyuHold[] = Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, serial: `TY-${i}`, x: i * 10, y: 90 - i * 10, radius: 1.7, grip: '综合', size: 'M', source: 'reviewed', confirmed: true }));
const empty = () => newTianyuRoute(holds, 30, 'r1');
const withPoints = () => holds.reduce((doc, h) => addRoutePoint(doc, h.id), empty());

describe('天宇板人工线路', () => {
  it('可从零选点，重复点击不重复添加，不改变板面', () => {
    const original = empty(); const doc = addRoutePoint(original, 'h0');
    expect(doc.points).toHaveLength(1); expect(addRoutePoint(doc, 'h0')).toBe(doc);
    expect(doc.board.holds).toEqual(original.board.holds); expect(original.points).toHaveLength(0);
    expect(addRoutePoint(doc, 'missing')).toBe(doc);
  });
  it('移除线路点会移除关联动作，但不会删除板面岩点', () => {
    const doc = removeRoutePoint(withPoints(), 'h1');
    expect(doc.points.some(p => p.holdId === 'h1')).toBe(false);
    expect(doc.moves.some(p => p.holdId === 'h1')).toBe(false); expect(doc.board.holds).toHaveLength(6);
  });
  it('同一手脚起步只对应一个点，允许双手共点', () => {
    let doc = assignStartLimb(withPoints(), 'h0', 'LH');
    doc = assignStartLimb(doc, 'h0', 'RH'); doc = assignStartLimb(doc, 'h1', 'LH');
    expect(doc.points.find(p => p.holdId === 'h0')?.startLimbs).toEqual(['RH']);
    expect(doc.points.find(p => p.holdId === 'h1')?.startLimbs).toEqual(['LH']);
    doc = assignStartLimb(doc, 'h1', 'LH'); expect(doc.points.flatMap(p => p.startLimbs)).not.toContain('LH');
  });
  it('支持三点和四点起步，完整性检查不宣称安全或实测等级', () => {
    let doc = withPoints();
    for (const [id, limb] of [['h0', 'LH'], ['h0', 'RH'], ['h1', 'LF'], ['h2', 'RF']] as const) doc = assignStartLimb(doc, id, limb);
    doc = setRouteRole(doc, 'h5', 'finish', true);
    expect(routeDraftWarnings(doc)).toEqual([]);
    doc = assignStartLimb(doc, 'h3', 'RH'); expect(routeDraftWarnings(doc)).toEqual([]);
  });
  it('手脚兼用、终点可切换，纯脚点不自动保留手部动作', () => {
    let doc = setRouteRole(withPoints(), 'h0', 'foot', true);
    expect(doc.points[0].roles).toEqual(['move', 'foot']);
    doc = setRouteRole(doc, 'h0', 'move', false);
    expect(doc.moves.some(m => m.holdId === 'h0')).toBe(false);
    doc = setRouteRole(doc, 'h0', 'finish', true); expect(doc.moves.some(m => m.holdId === 'h0')).toBe(true);
  });
  it('同一点可复用为多个动作，顺序独立调整', () => {
    const doc = appendRouteMove(withPoints(), 'h0');
    expect(doc.points).toHaveLength(6); expect(doc.moves).toHaveLength(7);
    const moved = moveRouteAction(doc, 6, -1); expect(moved.moves[5].holdId).toBe('h0');
    expect(doc.moves[5].holdId).toBe('h5'); expect(moveRouteAction(doc, 0, -1)).toBe(doc);
  });
  it('AI 候选转换保留模型、需求和原始选点，不沿用评分', () => {
    const candidate = { title: '技术线路', grade: 'V6', placements: [
      { instanceId: 'h0', role: 'start', startLimbs: ['LH', 'RH'] as const as ['LH', 'RH'], step: 0 },
      { instanceId: 'h1', role: 'move', step: 1, hand: 'left' as const },
      { instanceId: 'h2', role: 'finish', step: 2, hand: 'right' as const },
    ] };
    const doc = routeFromCandidate(holds, 45, 'r1', candidate, 'gpt-6-astra', 'V6 技术');
    const edited = removeRoutePoint(doc, 'h1');
    expect(edited.origin.initialPoints).toHaveLength(3); expect(edited.points).toHaveLength(2);
    expect(doc.origin.model).toBe('gpt-6-astra'); expect(doc.moves.map(m => m.holdId)).toEqual(['h1', 'h2']);
    expect(doc).not.toHaveProperty('metrics'); expect(doc.board.angle).toBe(45);
  });
  it('优先保留 AI Beta 中的复用动作顺序', () => {
    const doc = routeFromCandidate(holds, 30, 'r1', { title: '复用', grade: 'V4',
      placements: [{ instanceId: 'h0', role: 'move', step: 1 }],
      metrics: { beta: [{ targetInstanceId: 'h0', hand: 'left', technique: 'static' }, { targetInstanceId: 'h0', hand: 'right', technique: 'match' }] },
    }, 'gpt-6-astra', '并手');
    expect(doc.points).toHaveLength(1); expect(doc.moves).toHaveLength(2);
  });
});
