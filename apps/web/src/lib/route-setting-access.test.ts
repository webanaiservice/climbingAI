import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseRouteSetting } from './route-setting-access';

afterEach(() => vi.unstubAllEnvs());

describe('AI 定线灰度开关', () => {
  it('生产环境默认关闭', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_ROUTE_SETTING_ENABLED', '');
    vi.stubEnv('AI_ROUTE_SETTING_ALLOWED_EMAILS', '');
    expect(canUseRouteSetting('setter@example.com')).toBe(false);
  });

  it('生产环境仅允许白名单账号', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_ROUTE_SETTING_ENABLED', 'true');
    vi.stubEnv('AI_ROUTE_SETTING_ALLOWED_EMAILS', 'setter@example.com');
    expect(canUseRouteSetting('SETTER@example.com')).toBe(true);
    expect(canUseRouteSetting('other@example.com')).toBe(false);
  });

  it('开发环境默认允许本地演示', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AI_ROUTE_SETTING_ENABLED', '');
    vi.stubEnv('AI_ROUTE_SETTING_ALLOWED_EMAILS', '');
    expect(canUseRouteSetting('setter@example.com')).toBe(true);
  });
});
