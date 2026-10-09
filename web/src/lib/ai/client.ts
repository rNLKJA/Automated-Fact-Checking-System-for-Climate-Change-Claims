/**
 * `completeJson`: call the configured provider, parse the JSON answer and
 * validate it with zod, retrying politely on rate limits and overloads.
 */
import type { z } from "zod";

import { callProvider, type JsonRequest, type JsonSchema, type Usage } from "./adapters";
import { AiError, errorFromThrown } from "./errors";

export type CompleteJsonRequest<T extends z.ZodType> = Omit<JsonRequest, "schema"> & {
  schema: JsonSchema;
  /** validates the parsed JSON; its output type is the result type */
  validator: T;
  /** extra attempts after a retryable failure (429, 529, 5xx) */
  retries?: number;
  /** called before each retry with the failure being retried (for the audit log) */
  onRetry?: (failure: { attempt: number; kind: string; status: number | null }) => void;
  /** injectable for tests */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
};

export type CompleteJsonResult<T> = {
  data: T;
  rawText: string;
  model: string;
  usage: Usage;
  /** latency of the successful attempt, in milliseconds */
  latencyMs: number;
  attempts: number;
};

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AiError("aborted", "Stopped."));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new AiError("aborted", "Stopped."));
      },
      { once: true },
    );
  });
}

/** Exponential backoff (1 s, 2 s, 4 s ...) unless the provider said how long to wait. */
export function backoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, 60_000);
  return Math.min(1000 * 2 ** attempt, 16_000);
}

/** Parse the model's text as JSON and validate it; failures are the model's fault. */
export function parseJsonOutput<T extends z.ZodType>(text: string, validator: T): z.output<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("invalid_output", "The model's answer was not valid JSON.", {
      rawText: text,
    });
  }
  const result = validator.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AiError(
      "invalid_output",
      `The model's answer did not match the expected format${issue ? ` (${issue.path.join(".") || "root"}: ${issue.message})` : ""}.`,
      { rawText: text },
    );
  }
  return result.data;
}

export async function completeJson<T extends z.ZodType>(
  req: CompleteJsonRequest<T>,
): Promise<CompleteJsonResult<z.output<T>>> {
  if (!req.apiKey.trim()) throw new AiError("no_key", "Add an API key in AI settings first.");
  const retries = req.retries ?? 2;
  const sleep = req.sleep ?? defaultSleep;
  const now = req.now ?? (() => performance.now());
  for (let attempt = 0; ; attempt++) {
    const t0 = now();
    try {
      const raw = await callProvider(req);
      const latencyMs = now() - t0;
      let data: z.output<T>;
      try {
        data = parseJsonOutput(raw.text, req.validator);
      } catch (err) {
        const e = err as AiError;
        throw new AiError(e.kind, e.message, {
          rawText: raw.text,
          answered: { model: raw.model, latencyMs, usage: raw.usage },
        });
      }
      return {
        data,
        rawText: raw.text,
        model: raw.model,
        usage: raw.usage,
        latencyMs,
        attempts: attempt + 1,
      };
    } catch (err) {
      let e = errorFromThrown(req.provider, err);
      if (e.modelFault && e.answered && e.answered.latencyMs === 0) {
        // the provider answered (refusal, cut off): record how long that took
        e = new AiError(e.kind, e.message, {
          rawText: e.rawText,
          answered: { ...e.answered, latencyMs: now() - t0 },
        });
      }
      if (!e.retryable || attempt >= retries || req.signal?.aborted) throw e;
      req.onRetry?.({ attempt: attempt + 1, kind: e.kind, status: e.status ?? null });
      await sleep(backoffMs(attempt, e.retryAfterMs), req.signal);
    }
  }
}
