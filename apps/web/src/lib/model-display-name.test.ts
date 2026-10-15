import { describe, expect, it } from 'vitest';
import { modelDisplayName } from './model-display-name';

describe('真实模型名称', () => {
  it.each([
    ['claude-opus-5', 'Claude Opus 5'], ['claude-fable-5', 'Claude Fable 5'], ['claude-opus-5-5', 'Claude Opus 5.5'],
    ['gpt-5.5', 'GPT-5.5'], ['gpt-5.6-sol', 'GPT-5.6 Sol'], ['gpt-6-astra', 'GPT-6 Astra'], ['gpt-6-sol', 'GPT-6 Sol'],
  ])('%s 展示真实型号', (id, expected) => expect(modelDisplayName(id)).toBe(expected));
  it('未知模型保留服务端名称', () => expect(modelDisplayName('other', 'Other')).toBe('Other'));
});
