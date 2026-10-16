import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => vi.fn());
vi.mock('./server-session', () => ({ requireSession: session }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('../features/route-setting/route-setting-page', () => ({ default: () => null }));
import OperationsPage from '../app/dashboard/route-setting/page';
import TrainingBoardPage from '../app/dashboard/training/board-setting/page';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); session.mockReset(); });

describe('独立定线入口的服务端访问控制', () => {
  for (const [name, page, workspace] of [
    ['运营', OperationsPage, 'operations'], ['训练板', TrainingBoardPage, 'training-board'],
  ] as const) {
    it(`${name}仅向原白名单账号开放，锁定正确业务场景`, async () => {
      vi.stubGlobal('React', React);
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('AI_ROUTE_SETTING_ENABLED', 'true');
      vi.stubEnv('AI_ROUTE_SETTING_ALLOWED_EMAILS', 'allowed@example.test');
      session.mockResolvedValue({ organization: { id: 'gym-a' }, account: { id: 'account-a', email: 'allowed@example.test' } });
      const result = await page();
      expect(result.props.workspace).toBe(workspace);
      if (workspace === 'operations') expect(result.props.storageScope).toBe('gym-a.account-a');
      session.mockResolvedValue({ account: { email: 'other@example.test' } });
      await expect(page()).rejects.toThrow('NOT_FOUND');
      vi.stubEnv('AI_ROUTE_SETTING_ENABLED', 'false');
      session.mockResolvedValue({ account: { email: 'allowed@example.test' } });
      await expect(page()).rejects.toThrow('NOT_FOUND');
    });
    it(`${name}不绕过登录验证`, async () => {
      session.mockRejectedValue(new Error('LOGIN_REQUIRED'));
      await expect(page()).rejects.toThrow('LOGIN_REQUIRED');
    });
  }
});
