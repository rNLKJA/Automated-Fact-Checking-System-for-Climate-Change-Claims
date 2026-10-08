import { describe, expect, it } from "vitest";
import { z } from "zod";

import { anthropicBody, callAnthropic, callOpenAI, openaiBody, type JsonRequest } from "./adapters";
import { backoffMs, completeJson, parseJsonOutput } from "./client";
import { AiError, describeAiError, errorFromResponse, errorFromThrown } from "./errors";
import { estimateCostUsd, modelOption, roughTokens } from "./providers";
import {
  anthropicMessage,
  jsonResponse,
  mockFetch,
  noSleep,
  openaiCompletion,
} from "./test-helpers";

const KEY = "sk-ant-api03-TESTKEY-not-real-0000";
const schema = { type: "object", properties: { ok: { type: "boolean" } } };
const validator = z.object({ ok: z.boolean() });

function req(provider: "anthropic" | "openai", fetchImpl: typeof fetch): JsonRequest {
  return {
    provider,
    apiKey: KEY,
    model: provider === "anthropic" ? "claude-haiku-4-5" : "gpt-5-mini",
    system: "sys",
    user: "hello",
    schemaName: "test",
    schema,
    fetchImpl,
  };
}

describe("Anthropic adapter", () => {
  it("calls the Messages API directly from the browser with a JSON-schema output format", async () => {
    const { impl, calls } = mockFetch([jsonResponse(200, anthropicMessage('{"ok":true}'))]);
    const out = await callAnthropic(req("anthropic", impl));
    expect(out).toEqual({
      text: '{"ok":true}',
      model: "claude-haiku-4-5",
      usage: { inputTokens: 812, outputTokens: 64 },
    });
    const [call] = calls;
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(call.body).toMatchObject({
      model: "claude-haiku-4-5",
      system: "sys",
      messages: [{ role: "user", content: "hello" }],
      output_config: { format: { type: "json_schema", schema } },
      temperature: 0,
    });
    // Haiku 4.5 rejects `effort`, so it is not sent
    expect((call.body.output_config as Record<string, unknown>).effort).toBeUndefined();
  });

  it("runs Sonnet at low effort and without a temperature", () => {
    const body = anthropicBody({ ...req("anthropic", fetch), model: "claude-sonnet-5-5" });
    expect(body.output_config).toMatchObject({ effort: "low" });
    expect("temperature" in body).toBe(false);
    expect(body.max_tokens).toBe(4096);
  });

  it("reports refusals and truncation as model faults", async () => {
    const refusal = mockFetch([
      jsonResponse(200, anthropicMessage("", { stop_reason: "refusal", content: [] })),
    ]);
    await expect(callAnthropic(req("anthropic", refusal.impl))).rejects.toMatchObject({
      kind: "refusal",
      modelFault: true,
    });
    const cut = mockFetch([
      jsonResponse(200, anthropicMessage('{"ok":', { stop_reason: "max_tokens" })),
    ]);
    await expect(callAnthropic(req("anthropic", cut.impl))).rejects.toMatchObject({
      kind: "truncated",
      rawText: '{"ok":',
    });
  });
});

describe("OpenAI adapter", () => {
  it("uses chat completions with a strict JSON schema", async () => {
    const { impl, calls } = mockFetch([jsonResponse(200, openaiCompletion('{"ok":false}'))]);
    const out = await callOpenAI(req("openai", impl));
    expect(out.text).toBe('{"ok":false}');
    expect(out.usage).toEqual({ inputTokens: 700, outputTokens: 90 });
    expect(out.model).toBe("gpt-5-mini-2025-08-07");
    const [call] = calls;
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect((call.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(call.body).toEqual(openaiBody(req("openai", impl)));
    expect(call.body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "test", strict: true, schema },
    });
  });

  it("maps refusals and length cut-offs", async () => {
    const r = mockFetch([
      jsonResponse(200, {
        ...openaiCompletion(""),
        choices: [{ finish_reason: "stop", message: { content: null, refusal: "no" } }],
      }),
    ]);
    await expect(callOpenAI(req("openai", r.impl))).rejects.toMatchObject({ kind: "refusal" });
    const l = mockFetch([
      jsonResponse(200, {
        ...openaiCompletion("{"),
        choices: [{ finish_reason: "length", message: { content: "{" } }],
      }),
    ]);
    await expect(callOpenAI(req("openai", l.impl))).rejects.toMatchObject({ kind: "truncated" });
  });
});

describe("error mapping", () => {
  it("classifies provider HTTP errors", () => {
    const cases: [number, unknown, string][] = [
      [
        401,
        { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
        "invalid_key",
      ],
      [403, { error: { type: "permission_error", message: "nope" } }, "permission"],
      [404, { error: { type: "not_found_error", message: "model: x" } }, "not_found"],
      [429, { error: { type: "rate_limit_error", message: "slow down" } }, "rate_limit"],
      [429, { error: { code: "insufficient_quota", message: "quota" } }, "billing"],
      [402, {}, "billing"],
      [529, { error: { type: "overloaded_error", message: "busy" } }, "overloaded"],
      [500, null, "server"],
      [400, { error: { type: "invalid_request_error", message: "bad" } }, "bad_request"],
    ];
    for (const [status, body, kind] of cases) {
      expect(errorFromResponse("anthropic", status, body).kind, `${status}`).toBe(kind);
    }
    const e = errorFromResponse("anthropic", 429, {}, new Headers({ "retry-after": "3" }));
    expect(e.retryAfterMs).toBe(3000);
    expect(e.retryable).toBe(true);
    expect(errorFromResponse("openai", 401, {}).retryable).toBe(false);
    expect(errorFromResponse("openai", 401, {}).message).toContain("OpenAI rejected the API key");
  });

  it("explains network (CORS) failures and aborts", () => {
    const net = errorFromThrown("anthropic", new TypeError("Failed to fetch"));
    expect(net.kind).toBe("network");
    expect(net.message).toContain("api.anthropic.com");
    expect(errorFromThrown("openai", new DOMException("x", "AbortError")).kind).toBe("aborted");
    expect(describeAiError(net)).toBe(net.message);
    expect(describeAiError("weird")).toMatch(/unexpected/);
  });
});

describe("completeJson", () => {
  it("parses and validates the answer and reports latency and usage", async () => {
    const { impl } = mockFetch([jsonResponse(200, anthropicMessage('{"ok":true}'))]);
    let t = 100;
    const res = await completeJson({
      ...req("anthropic", impl),
      validator,
      now: () => (t += 250),
    });
    expect(res.data).toEqual({ ok: true });
    expect(res.latencyMs).toBe(250);
    expect(res.attempts).toBe(1);
    expect(res.usage.inputTokens).toBe(812);
  });

  it("retries rate limits and overloads, then succeeds", async () => {
    const waits: number[] = [];
    const { impl, calls } = mockFetch([
      jsonResponse(429, { error: { type: "rate_limit_error" } }, { "retry-after": "2" }),
      jsonResponse(529, { error: { type: "overloaded_error" } }),
      jsonResponse(200, anthropicMessage('{"ok":true}')),
    ]);
    const res = await completeJson({
      ...req("anthropic", impl),
      validator,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([2000, 2000]);
    expect(res.attempts).toBe(3);
  });

  it("does not retry an invalid key and gives up after the retry budget", async () => {
    const bad = mockFetch([jsonResponse(401, { error: { type: "authentication_error" } })]);
    await expect(
      completeJson({ ...req("anthropic", bad.impl), validator, sleep: noSleep }),
    ).rejects.toMatchObject({ kind: "invalid_key" });
    expect(bad.calls).toHaveLength(1);
    const busy = mockFetch([jsonResponse(529, {})]);
    await expect(
      completeJson({ ...req("anthropic", busy.impl), validator, sleep: noSleep, retries: 1 }),
    ).rejects.toMatchObject({ kind: "overloaded" });
    expect(busy.calls).toHaveLength(2);
  });

  it("flags answers that are not valid JSON or do not match the schema", async () => {
    const notJson = mockFetch([jsonResponse(200, anthropicMessage("Sure! SUPPORTS"))]);
    const e1 = await completeJson({ ...req("anthropic", notJson.impl), validator }).catch(
      (e: AiError) => e,
    );
    expect(e1).toBeInstanceOf(AiError);
    expect((e1 as AiError).kind).toBe("invalid_output");
    expect((e1 as AiError).answered?.usage.inputTokens).toBe(812);
    const wrong = mockFetch([jsonResponse(200, anthropicMessage('{"ok":"yes"}'))]);
    await expect(
      completeJson({ ...req("anthropic", wrong.impl), validator }),
    ).rejects.toMatchObject({ kind: "invalid_output", rawText: '{"ok":"yes"}' });
    expect(() => parseJsonOutput("{}", validator)).toThrow(/expected format \(ok:/);
  });

  it("refuses to call without a key and never puts the key in an error", async () => {
    const { impl, calls } = mockFetch([jsonResponse(200, anthropicMessage("{}"))]);
    await expect(
      completeJson({ ...req("anthropic", impl), apiKey: "  ", validator }),
    ).rejects.toMatchObject({ kind: "no_key" });
    expect(calls).toHaveLength(0);
    const bad = mockFetch([jsonResponse(401, { error: { message: `bad key ${KEY}` } })]);
    const e = await completeJson({ ...req("anthropic", bad.impl), validator }).catch(
      (x: AiError) => x,
    );
    expect(String((e as AiError).message)).not.toContain(KEY);
  });

  it("uses exponential backoff when no retry-after is given", () => {
    expect([0, 1, 2, 3, 10].map((a) => backoffMs(a))).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(backoffMs(0, 120_000)).toBe(60_000);
  });
});

describe("provider catalogue", () => {
  it("prices the Anthropic models and estimates a run's cost", () => {
    expect(modelOption("anthropic", "claude-haiku-4-5").pricing).toEqual({ input: 1, output: 5 });
    expect(modelOption("anthropic", "claude-sonnet-5-5").pricing).toEqual({ input: 2, output: 10 });
    expect(estimateCostUsd("anthropic", "claude-haiku-4-5", 1_000_000, 200_000)).toBeCloseTo(2, 12);
    expect(estimateCostUsd("openai", "gpt-5-mini", 1000, 1000)).toBeNull();
    expect(modelOption("openai", "my-model").maxTokens).toBeGreaterThan(0);
    expect(roughTokens("abcd".repeat(10))).toBe(10);
  });
});
