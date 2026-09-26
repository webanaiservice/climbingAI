import { z } from 'zod';
import type { AppEnvironment } from '../config/environment';
import { reportSchema } from './training.dto';

type Config = Pick<
  AppEnvironment,
  'DEROUTER_API_KEY' | 'DEROUTER_OPENAI_BASE' | 'DEROUTER_ANTHROPIC_BASE'
>;
export class TrainingProviderError extends Error {}
export async function requestTrainingReport(
  config: Config,
  model: string,
  system: string,
  context: unknown,
  frames: { seconds: number; image: string }[],
) {
  const key = config.DEROUTER_API_KEY;
  if (!key) throw new TrainingProviderError('AI 服务尚未配置，请联系管理员。');
  const text = `请返回符合约定结构的 JSON 复盘结果。\n分析上下文（用户数据）：${JSON.stringify(context)}\n实际抽样帧数：${frames.length}`;
  const claude = model.startsWith('claude-');
  const content: unknown[] = [{ type: 'text', text }];
  for (const frame of frames) {
    content.push({ type: 'text', text: `原视频约 ${frame.seconds.toFixed(3)} 秒` });
    content.push(
      claude
        ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame.image } }
        : {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${frame.image}`, detail: 'high' },
          },
    );
  }
  const base = claude ? config.DEROUTER_ANTHROPIC_BASE : config.DEROUTER_OPENAI_BASE;
  let response: Response;
  try {
    response = await fetch(
      `${base.replace(/\/+$/, '')}${claude ? '/v1/messages' : '/chat/completions'}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(180000),
        headers: claude
          ? {
              'Content-Type': 'application/json',
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
            }
          : { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(
          claude
            ? {
                model,
                max_tokens: 4500,
                system,
                messages: [{ role: 'user', content }],
                tools: [
                  {
                    name: 'submit_training_report',
                    description: '提交有画面证据的训练复盘',
                    input_schema: z.toJSONSchema(reportSchema, { target: 'draft-7' }),
                  },
                ],
                tool_choice: { type: 'tool', name: 'submit_training_report' },
              }
            : {
                model,
                max_tokens: 4500,
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content },
                ],
              },
        ),
      },
    );
  } catch (error) {
    throw new TrainingProviderError(
      (error as Error).name === 'TimeoutError'
        ? '模型响应超过 3 分钟，请稍后重试或选择其他模型。'
        : '暂时无法连接模型服务，请稍后重试。',
    );
  }
  if (!response.ok) {
    const reason =
      response.status === 401 || response.status === 403
        ? '服务端密钥或模型权限不可用，请联系管理员。'
        : response.status === 429
          ? '模型服务繁忙或额度受限，请稍后重试。'
          : response.status === 400 || response.status === 404
            ? '该模型暂不接受本次分析请求，请切换模型重试。'
            : '模型服务暂时异常，请稍后重试或选择其他模型。';
    throw new TrainingProviderError(reason);
  }
  if (claude) {
    const payload = (await response.json()) as {
      content?: Array<{ type?: string; name?: string; input?: unknown; text?: string }>;
    };
    const tool = payload.content?.find(
      (block) => block.type === 'tool_use' && block.name === 'submit_training_report',
    );
    return tool?.input
      ? JSON.stringify(tool.input)
      : (payload.content
          ?.filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('') ?? '');
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  const value = payload.choices?.[0]?.message?.content;
  return typeof value === 'string' ? value : (value?.map((b) => b.text ?? '').join('') ?? '');
}
