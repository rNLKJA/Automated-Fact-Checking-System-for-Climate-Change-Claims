/**
 * Provider adapters: one structured-JSON request, straight from the browser.
 *
 * Anthropic: Messages API with `output_config.format` (JSON schema) and the
 * `anthropic-dangerous-direct-browser-access` header, which is what lets a
 * browser call the API with the visitor's own key.
 * OpenAI: Chat Completions with `response_format: json_schema` (strict).
 *
 * The key travels only in the request headers to the provider. It is never part
 * of the returned value, never logged and never sent to this site's server.
 */
import { AiError, errorFromResponse, errorFromThrown } from "./errors";
import { modelOption, PROVIDERS, type ProviderId } from "./providers";

export type JsonSchema = Record<string, unknown>;

export type JsonRequest = {
  provider: ProviderId;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export type Usage = { inputTokens: number | null; outputTokens: number | null };

export type RawCompletion = {
  text: string;
  /** model id reported by the provider */
  model: string;
  usage: Usage;
};

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export function anthropicBody(req: JsonRequest) {
  const m = modelOption("anthropic", req.model);
  return {
    model: req.model,
    max_tokens: m.maxTokens,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    output_config: {
      format: { type: "json_schema", schema: req.schema },
      ...(m.effort ? { effort: m.effort } : {}),
    },
    ...(m.temperature !== undefined ? { temperature: m.temperature } : {}),
  };
}

export function openaiBody(req: JsonRequest) {
  const m = modelOption("openai", req.model);
  return {
    model: req.model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schemaName, strict: true, schema: req.schema },
    },
    max_completion_tokens: m.maxTokens,
  };
}

type AnthropicResponse = {
  model?: string;
  stop_reason?: string | null;
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

type OpenAIResponse = {
  model?: string;
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export async function callAnthropic(req: JsonRequest): Promise<RawCompletion> {
  const doFetch = req.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(PROVIDERS.anthropic.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": req.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(anthropicBody(req)),
      signal: req.signal,
    });
  } catch (err) {
    throw errorFromThrown("anthropic", err);
  }
  const body = await readJson(res);
  if (!res.ok) throw errorFromResponse("anthropic", res.status, body, res.headers);
  const json = (body ?? {}) as AnthropicResponse;
  const usage = {
    inputTokens: num(json.usage?.input_tokens),
    outputTokens: num(json.usage?.output_tokens),
  };
  const model = json.model ?? req.model;
  const answered = { model, latencyMs: 0, usage };
  if (json.stop_reason === "refusal") {
    throw new AiError("refusal", "The model declined to answer this request.", { answered });
  }
  const text = (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  if (json.stop_reason === "max_tokens") {
    throw new AiError("truncated", "The answer was cut off at the token limit.", {
      rawText: text,
      answered,
    });
  }
  return { text, model, usage };
}

export async function callOpenAI(req: JsonRequest): Promise<RawCompletion> {
  const doFetch = req.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(PROVIDERS.openai.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify(openaiBody(req)),
      signal: req.signal,
    });
  } catch (err) {
    throw errorFromThrown("openai", err);
  }
  const body = await readJson(res);
  if (!res.ok) throw errorFromResponse("openai", res.status, body, res.headers);
  const json = (body ?? {}) as OpenAIResponse;
  const choice = json.choices?.[0];
  const message = choice?.message;
  const model = json.model ?? req.model;
  const usage = {
    inputTokens: num(json.usage?.prompt_tokens),
    outputTokens: num(json.usage?.completion_tokens),
  };
  const answered = { model, latencyMs: 0, usage };
  if (message?.refusal || choice?.finish_reason === "content_filter") {
    throw new AiError("refusal", "The model declined to answer this request.", { answered });
  }
  const text = message?.content ?? "";
  if (choice?.finish_reason === "length") {
    throw new AiError("truncated", "The answer was cut off at the token limit.", {
      rawText: text,
      answered,
    });
  }
  return { text, model, usage };
}

export function callProvider(req: JsonRequest): Promise<RawCompletion> {
  return req.provider === "anthropic" ? callAnthropic(req) : callOpenAI(req);
}
