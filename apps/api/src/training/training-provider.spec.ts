import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestTrainingReport } from './training-provider';
import { analysisRequestSchema } from './training.dto';
const config = {
  DEROUTER_API_KEY: 'private-test-value',
  DEROUTER_OPENAI_BASE: 'https://configured.example/openai/v1',
  DEROUTER_ANTHROPIC_BASE: 'https://configured.example/proxy',
};
const frames = [{ seconds: 2.5, image: 'jpeg-test' }];
afterEach(() => vi.unstubAllGlobals());
describe('training model selection and provider protocols', () => {
  it.each(['claude-opus-5-5', 'gpt-6-astra', 'gpt-6-sol'])('accepts %s', (model) =>
    expect(analysisRequestSchema.parse({ model, processingConsent: true }).model).toBe(model),
  );
  it('rejects arbitrary models', () =>
    expect(
      analysisRequestSchema.safeParse({ model: 'unknown', processingConsent: true }).success,
    ).toBe(false));
  it.each(['gpt-6-astra', 'gpt-6-sol'])(
    'sends images and selected %s to the shared OpenAI endpoint',
    async (model) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ choices: [{ message: { content: '{"summary":"test"}' } }] }),
          ),
        );
      vi.stubGlobal('fetch', fetcher);
      expect(
        await requestTrainingReport(config, model, 'system', { focus: '换脚' }, frames),
      ).toContain('summary');
      expect(fetcher.mock.calls[0][0]).toBe(config.DEROUTER_OPENAI_BASE + '/chat/completions');
      const body = JSON.parse(fetcher.mock.calls[0][1].body);
      expect(body.model).toBe(model);
      expect(body.messages[1].content[0].text).toContain('JSON');
      expect(body.messages[1].content[2].image_url.url).toContain('jpeg-test');
    },
  );
  it('uses Anthropic image blocks and tool output for Opus 5.5', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'tool_use',
              name: 'submit_training_report',
              input: { summary: 'tool result' },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(await requestTrainingReport(config, 'claude-opus-5-5', 'system', {}, frames)).toBe(
      '{"summary":"tool result"}',
    );
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(config.DEROUTER_ANTHROPIC_BASE + '/v1/messages');
    const body = JSON.parse(options.body);
    expect(body.messages[0].content[2].source.media_type).toBe('image/jpeg');
    expect(body.tool_choice.name).toBe('submit_training_report');
  });
  it('returns a useful error without exposing provider response bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private provider details', { status: 401 })),
    );
    await expect(requestTrainingReport(config, 'gpt-6-sol', 'system', {}, frames)).rejects.toThrow(
      '密钥或模型权限',
    );
  });
});
