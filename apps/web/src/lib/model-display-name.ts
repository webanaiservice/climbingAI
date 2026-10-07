// UI aliases only. Request values and stored model IDs must keep their original values.
const modelDisplayNames: Record<string, string> = {
  'claude-opus-5': 'Qwen Opus 5',
  'claude-fable-5': 'Qwen Fable 5',
  'claude-opus-5-5': 'Qwen Opus 5.5',
  'gpt-5.5': 'DeepSeek 5.5',
  'gpt-5.6-sol': 'DeepSeek 5.6 Sol',
  'gpt-6-astra': 'DeepSeek 6 Astra',
  'gpt-6-sol': 'DeepSeek 6 Sol',
};

export function modelDisplayName(modelId: string, fallback = modelId): string {
  return Object.hasOwn(modelDisplayNames, modelId) ? modelDisplayNames[modelId] : fallback;
}
