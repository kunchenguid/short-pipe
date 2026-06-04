export type ShortPipeConfig = {
  version: 1;
  defaultModel: string;
};

export const DEFAULT_CODEX_MODEL = "openai-codex/gpt-5.5";

export function defaultShortPipeConfig(): ShortPipeConfig {
  return {
    version: 1,
    defaultModel: DEFAULT_CODEX_MODEL,
  };
}

export function normalizeShortPipeConfig(value: unknown): ShortPipeConfig {
  if (!value || typeof value !== "object") return defaultShortPipeConfig();
  const candidate = value as { defaultModel?: unknown };
  if (typeof candidate.defaultModel !== "string" || !candidate.defaultModel.trim()) {
    return defaultShortPipeConfig();
  }
  return {
    version: 1,
    defaultModel: candidate.defaultModel.trim(),
  };
}
