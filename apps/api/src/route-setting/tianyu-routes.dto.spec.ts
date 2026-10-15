import { describe, expect, it } from 'vitest';
import { parseCreateTianyuRoute, parseUpdateTianyuRoute } from './tianyu-routes.dto';

export const routeDocument = () => ({
  version: 1 as const, name: '人工线路', grade: 'V4', notes: '',
  board: { id: 'TY-01' as const, revision: 'r1', angle: 30, holds: [{ id: 'h1', serial: 'TY-001', x: 30, y: 70, radius: 1.7, grip: '综合', size: 'M', source: 'reviewed' as const, confirmed: true }] },
  points: [{ holdId: 'h1', roles: ['move' as const], startLimbs: [] as Array<'LH' | 'RH' | 'LF' | 'RF'> }],
  moves: [{ id: 'm1', holdId: 'h1', hand: 'left' as const, technique: 'static', note: '' }], origin: { kind: 'manual' as const },
});
describe('训练板线路存档校验', () => {
  it('允许保存不完整的人工草稿，保留角度与动作', () => expect(parseCreateTianyuRoute({ document: routeDocument() }).document).toEqual(routeDocument()));
  it('不接受不存在的点、未确认点或重复点', () => {
    const missing = routeDocument(); missing.points[0].holdId = 'missing'; expect(() => parseCreateTianyuRoute({ document: missing })).toThrow();
    const pending = routeDocument(); pending.board.holds[0].confirmed = false; expect(() => parseCreateTianyuRoute({ document: pending })).toThrow();
    const duplicate = routeDocument(); duplicate.points.push(duplicate.points[0]); expect(() => parseCreateTianyuRoute({ document: duplicate })).toThrow();
  });
  it('不接受孤立动作及重复起步四肢', () => {
    const doc = routeDocument(); doc.moves[0].holdId = 'missing'; expect(() => parseCreateTianyuRoute({ document: doc })).toThrow();
    const starts = routeDocument(); starts.points[0].startLimbs = ['LH', 'LH']; expect(() => parseCreateTianyuRoute({ document: starts })).toThrow();
  });
  it.each([-5, 7, 65])('拒绝无效仰角 %s', angle => { const doc = routeDocument(); doc.board.angle = angle; expect(() => parseCreateTianyuRoute({ document: doc })).toThrow(); });
  it('更新必须带正整数版本号，并拒绝额外越权字段', () => {
    expect(() => parseUpdateTianyuRoute({ document: routeDocument() })).toThrow();
    expect(parseUpdateTianyuRoute({ document: routeDocument(), revision: 1 }).revision).toBe(1);
    expect(() => parseCreateTianyuRoute({ document: routeDocument(), organizationId: 'other' })).toThrow();
  });
});
