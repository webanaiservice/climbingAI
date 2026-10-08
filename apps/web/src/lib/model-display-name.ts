// Temporary demo aliases only; these are not the actual models being called.
// Keep request values and stored model IDs unchanged so the display can be restored here.
const modelDisplayNames: Record<string, string> = {
  'claude-opus-5': 'Qwen3-235B-A22B',
  'claude-fable-5': 'Qwen3-32B',
  'claude-opus-5-5': 'Qwen3-Max',
  'gpt-5.5': 'DeepSeek V3',
  'gpt-5.6-sol': 'DeepSeek V3.1',
  'gpt-6-astra': 'DeepSeek V3.2',
  'gpt-6-sol': 'DeepSeek R1',
};

export function modelDisplayName(modelId: string, fallback = modelId): string {
  return Object.hasOwn(modelDisplayNames, modelId) ? modelDisplayNames[modelId] : fallback;
}
