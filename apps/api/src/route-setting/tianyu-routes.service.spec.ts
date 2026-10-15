import { describe, expect, it, vi } from 'vitest';
import { TianyuRoutesService } from './tianyu-routes.service';
import type { CurrentSession } from '../auth/session.service';
import type { PrismaService } from '../database/prisma.service';
import type { AuditService } from '../common/audit.service';

const session = { account: { id: 'actor' }, organization: { id: 'org-a' } } as CurrentSession;
const document = { name: '测试线', grade: 'V4', board: { angle: 30 }, points: [], origin: { kind: 'manual' } } as never;
function setup() {
  const routes = { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findFirstOrThrow: vi.fn() };
  const audit = { record: vi.fn() };
  const db = { trainingBoardRoute: routes, $transaction: async (fn: (tx: unknown) => unknown) => fn({ trainingBoardRoute: routes }) };
  return { routes, audit, subject: new TianyuRoutesService(db as unknown as PrismaService, audit as unknown as AuditService) };
}
describe('训练板线路岩馆隔离与并发控制', () => {
  it('列表和读取均限制当前岩馆，跨岩馆 ID 视为不存在', async () => {
    const { routes, subject } = setup(); await subject.list(session);
    expect(routes.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-a' });
    routes.findFirst.mockResolvedValue(null); await expect(subject.get(session, 'other-route')).rejects.toThrow('线路不存在');
    expect(routes.findFirst.mock.calls[0][0].where).toEqual({ id: 'other-route', organizationId: 'org-a' });
  });
  it('创建由会话决定岩馆及创建者，并写审计', async () => {
    const { routes, audit, subject } = setup(); routes.create.mockResolvedValue({ id: 'new', revision: 1 });
    await subject.save(session, document); expect(routes.create.mock.calls[0][0].data).toMatchObject({ organizationId: 'org-a', createdByAccountId: 'actor', updatedByAccountId: 'actor' });
    expect(audit.record).toHaveBeenCalledOnce();
  });
  it('旧版本不能覆盖新版本', async () => {
    const { routes, subject, audit } = setup(); routes.findFirst.mockResolvedValue({ id: 'route' }); routes.updateMany.mockResolvedValue({ count: 0 });
    await expect(subject.save(session, document, 'route', 1)).rejects.toThrow('已被其他人修改');
    expect(routes.updateMany.mock.calls[0][0].where).toEqual({ id: 'route', organizationId: 'org-a', revision: 1 });
    expect(audit.record).not.toHaveBeenCalled();
  });
  it('跨岩馆更新不会写入数据', async () => {
    const { routes, subject } = setup(); routes.findFirst.mockResolvedValue(null);
    await expect(subject.save(session, document, 'other-route', 1)).rejects.toThrow('线路不存在'); expect(routes.updateMany).not.toHaveBeenCalled();
  });
  it('合法更新递增版本', async () => {
    const { routes, subject } = setup(); routes.findFirst.mockResolvedValue({ id: 'route' }); routes.updateMany.mockResolvedValue({ count: 1 }); routes.findFirstOrThrow.mockResolvedValue({ id: 'route', revision: 2 });
    expect(await subject.save(session, document, 'route', 1)).toEqual({ id: 'route', revision: 2 });
    expect(routes.updateMany.mock.calls[0][0].data.revision).toEqual({ increment: 1 });
  });
});
