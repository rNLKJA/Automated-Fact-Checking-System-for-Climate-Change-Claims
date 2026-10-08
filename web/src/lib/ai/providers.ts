/**
 * The two providers a visitor can bring a key for, and the models offered.
 *
 * Calls go straight from the visitor's browser to the provider. Model ids and
 * Anthropic prices are as listed in Anthropic's model table on 2026-09-25;
 * the visitor's provider bills them directly, so every cost shown on the site
 * is an estimate, never a charge.
 */

export type ProviderId = "anthropic" | "openai";

export type ModelOption = {
  id: string;
  label: string;
  note: string;
  /** USD per million tokens */
  pricing?: { input: number; output: number };
  /** response budget for one fact-check (structured JSON, a sentence or two of rationale) */
  maxTokens: number;
  /** Anthropic `output_config.effort`; omitted for models that reject it (Haiku 4.5) */
  effort?: "low" | "medium" | "high";
  /** sampling temperature; omitted for models that only accept the default */
  temperature?: number;
};

export const PROVIDERS: Record<
  ProviderId,
  { label: string; endpoint: string; host: string; keysUrl: string; keyHint: string }
> = {
  anthropic: {
    label: "Anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    host: "api.anthropic.com",
    keysUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-…",
  },
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    host: "api.openai.com",
    keysUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…",
  },
};

export const ANTHROPIC_MODELS: readonly ModelOption[] = [
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    note: "Cheapest tier. The default.",
    pricing: { input: 1, output: 5 },
    maxTokens: 1024,
    temperature: 0,
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    note: "Stronger and about twice the price. Runs at low effort.",
    pricing: { input: 2, output: 10 },
    maxTokens: 4096,
    effort: "low",
  },
];

export const DEFAULT_ANTHROPIC_MODEL = ANTHROPIC_MODELS[0].id;

/** Editable in the settings dialog; any chat-completions model with JSON-schema output works. */
export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

/** OpenAI models are free text, so there is no price table for them. */
export const OPENAI_DEFAULTS: Omit<ModelOption, "id" | "label" | "note"> = { maxTokens: 4096 };

export function anthropicModel(id: string): ModelOption | undefined {
  return ANTHROPIC_MODELS.find((m) => m.id === id);
}

export function modelOption(provider: ProviderId, id: string): ModelOption {
  if (provider === "anthropic") {
    return anthropicModel(id) ?? { ...ANTHROPIC_MODELS[0], id, label: id, note: "" };
  }
  return { id, label: id, note: "", ...OPENAI_DEFAULTS };
}

/** Estimated USD for a number of tokens, or null when the price is unknown. */
export function estimateCostUsd(
  provider: ProviderId,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const pricing = modelOption(provider, modelId).pricing;
  if (!pricing) return null;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/** Rough token count for planning only (about four characters per token in English). */
export function roughTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
