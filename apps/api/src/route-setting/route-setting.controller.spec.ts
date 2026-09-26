import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import type { CurrentSession } from '../auth/session.service';
import type { AppConfigService } from '../config/app-config.service';
import type { AccessControlService } from '../security/access-control.service';
import type { RateLimitService } from '../security/rate-limit.service';
import { RouteSettingController } from './route-setting.controller';

const session = {
  account: { id: 'account-1', email: 'setter@example.com' },
  organization: { id: 'organization-1' },
} as CurrentSession;
const reply = { status: vi.fn() } as unknown as FastifyReply;

function controller(enabled: boolean, allowlist: string) {
  const access = { assert: vi.fn() };
  const rateLimits = { consume: vi.fn().mockRejectedValue(new Error('rate-limit-reached')) };
  const config = {
    values: {
      NODE_ENV: 'production',
      AI_ROUTE_SETTING_ENABLED: enabled,
      AI_ROUTE_SETTING_ALLOWED_EMAILS: allowlist,
    },
  } as AppConfigService;
  return {
    access,
    rateLimits,
    subject: new RouteSettingController(
      access as unknown as AccessControlService,
      rateLimits as unknown as RateLimitService,
      config,
    ),
  };
}

describe('AI 定线生产灰度', () => {
  it('默认关闭时不会消耗模型调用配额', async () => {
    const { subject, access, rateLimits } = controller(false, 'setter@example.com');
    await expect(subject.candidates(session, {}, reply)).rejects.toMatchObject({ status: 404 });
    expect(access.assert).not.toHaveBeenCalled();
    expect(rateLimits.consume).not.toHaveBeenCalled();
  });

  it('只允许白名单账号进入生成流程', async () => {
    const { subject, access, rateLimits } = controller(true, 'setter@example.com');
    await expect(subject.candidates(session, {}, reply)).rejects.toThrow('rate-limit-reached');
    expect(access.assert).toHaveBeenCalledOnce();
    expect(rateLimits.consume).toHaveBeenCalledOnce();
  });

  it('非白名单账号不能调用生成接口', async () => {
    const { subject, rateLimits } = controller(true, 'someone-else@example.com');
    await expect(subject.candidates(session, {}, reply)).rejects.toMatchObject({ status: 404 });
    expect(rateLimits.consume).not.toHaveBeenCalled();
  });
});
