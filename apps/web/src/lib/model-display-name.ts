// Display names only; request values and stored model IDs stay unchanged.
const modelDisplayNames: Record<string, string> = {
  'claude-opus-5': 'Claude Opus 5',
  'claude-fable-5': 'Claude Fable 5',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'gpt-5.5': 'GPT-5.5',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6-sol': 'GPT-6 Sol',
};

export function modelDisplayName(modelId: string, fallback = modelId): string {
  return Object.hasOwn(modelDisplayNames, modelId) ? modelDisplayNames[modelId] : fallback;
}
