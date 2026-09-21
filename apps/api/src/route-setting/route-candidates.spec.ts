import { describe, expect, it } from 'vitest';
import { generateRouteCandidates } from './route-candidates';

const modelConfig = {
  DEROUTER_API_KEY: undefined,
  DEROUTER_OPENAI_BASE: 'https://api-direct.derouter.ai/openai/v1',
  DEROUTER_ANTHROPIC_BASE: 'https://api-direct.derouter.ai/proxy',
};

const holds = Array.from({ length: 6 }, (_, index) => ({
  id: `test-hold-${index + 1}`,
  serial: `TEST-${index + 1}`,
  grip: '把手',
  size: 'M',
  material: 'PU',
  dimensions: '10 × 10 cm',
}));

describe('AI 定线请求边界', () => {
  it('拒绝空提示词并返回可读的参数错误', async () => {
    const response = await generateRouteCandidates({
      prompt: '', model: 'gpt-6-astra', holds,
    }, modelConfig);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('prompt') });
  });

  it('遵守用户指定的点数上限，不静默放宽起步约束', async () => {
    const response = await generateRouteCandidates({
      prompt: 'V4，最多4个点', model: 'gpt-6-astra', holds,
    }, modelConfig);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('不会自动放宽') });
  });

  it('只接受允许的模型名称', async () => {
    const response = await generateRouteCandidates({
      prompt: 'V4 技术型', model: 'unapproved-model', holds,
    }, modelConfig);
    expect(response.status).toBe(400);
  });
});
