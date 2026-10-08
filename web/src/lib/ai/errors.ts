/**
 * One error type for both providers, so the UI can explain what went wrong and
 * the harness can decide what to retry. Messages never include the API key.
 */
import { PROVIDERS, type ProviderId } from "./providers";

export type AiErrorKind =
  | "no_key"
  | "invalid_key"
  | "permission"
  | "billing"
  | "not_found"
  | "bad_request"
  | "rate_limit"
  | "overloaded"
  | "server"
  | "network"
  | "aborted"
  | "refusal"
  | "truncated"
  | "invalid_output";

const RETRYABLE: ReadonlySet<AiErrorKind> = new Set(["rate_limit", "overloaded", "server"]);

/** Errors the model is responsible for (scored as a wrong answer, not excluded). */
const MODEL_FAULTS: ReadonlySet<AiErrorKind> = new Set(["refusal", "truncated", "invalid_output"]);

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;
  /** the model's raw text, for invalid outputs */
  readonly rawText?: string;
  /** set when the provider answered (invalid outputs): what the call cost and took */
  readonly answered?: {
    model: string;
    latencyMs: number;
    usage: { inputTokens: number | null; outputTokens: number | null };
  };

  constructor(
    kind: AiErrorKind,
    message: string,
    extra: {
      status?: number;
      retryAfterMs?: number;
      rawText?: string;
      answered?: AiError["answered"];
    } = {},
  ) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.status = extra.status;
    this.retryAfterMs = extra.retryAfterMs;
    this.rawText = extra.rawText;
    this.answered = extra.answered;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  /** True when the model answered but the answer is unusable (counted as wrong in evaluation). */
  get modelFault(): boolean {
    return MODEL_FAULTS.has(this.kind);
  }
}

function retryAfter(headers: Headers | undefined): number | undefined {
  const v = headers?.get("retry-after");
  if (!v) return undefined;
  const s = Number(v);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : Math.max(0, t - Date.now());
}

/** A string field of the provider's `{ error: { ... } }` body, if present. */
function errorField(body: unknown, field: "type" | "code" | "message"): string | undefined {
  if (!body || typeof body !== "object" || !("error" in body)) return undefined;
  const e = (body as { error: unknown }).error;
  if (!e || typeof e !== "object") return undefined;
  const v = (e as Record<string, unknown>)[field];
  return typeof v === "string" ? v : undefined;
}

/** Map an HTTP error response from either provider onto an AiError. */
export function errorFromResponse(
  provider: ProviderId,
  status: number,
  body: unknown,
  headers?: Headers,
): AiError {
  const name = PROVIDERS[provider].label;
  const detail = errorField(body, "message")?.slice(0, 300);
  const errType = errorField(body, "code") ?? errorField(body, "type");
  const withDetail = (s: string) => (detail ? `${s} (${name} said: ${detail})` : s);

  if (status === 401) {
    return new AiError("invalid_key", `${name} rejected the API key. Check it and try again.`, {
      status,
    });
  }
  if (status === 402 || errType === "insufficient_quota" || errType === "billing_error") {
    return new AiError("billing", withDetail(`${name} reports a billing or quota problem.`), {
      status,
    });
  }
  if (status === 403) {
    return new AiError("permission", withDetail(`This key may not use that model.`), { status });
  }
  if (status === 404) {
    return new AiError("not_found", withDetail(`${name} does not know that model id.`), {
      status,
    });
  }
  if (status === 429) {
    return new AiError("rate_limit", `${name} is rate-limiting this key. Slowing down.`, {
      status,
      retryAfterMs: retryAfter(headers),
    });
  }
  if (status === 529 || errType === "overloaded_error") {
    return new AiError("overloaded", `${name} is temporarily overloaded.`, {
      status,
      retryAfterMs: retryAfter(headers),
    });
  }
  if (status >= 500) {
    return new AiError("server", `${name} returned a server error (${status}).`, {
      status,
      retryAfterMs: retryAfter(headers),
    });
  }
  return new AiError("bad_request", withDetail(`${name} rejected the request (${status}).`), {
    status,
  });
}

/** Turn anything thrown by fetch into an AiError. */
export function errorFromThrown(provider: ProviderId, err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new AiError("aborted", "Stopped.");
  }
  if (err instanceof Error && err.name === "AbortError") return new AiError("aborted", "Stopped.");
  return new AiError(
    "network",
    `The browser could not reach ${PROVIDERS[provider].host}. This is usually the connection, an ad or privacy blocker, or a network that blocks cross-origin requests (CORS).`,
  );
}

/** A short, human explanation for the UI. */
export function describeAiError(err: unknown): string {
  if (err instanceof AiError) return err.message;
  return "Something unexpected went wrong with the AI request.";
}
