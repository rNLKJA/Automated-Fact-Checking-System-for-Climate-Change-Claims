/** Fetch mocks for the AI client tests (no network is ever touched). */

export type RecordedCall = { url: string; init: RequestInit; body: Record<string, unknown> };

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A fetch that replays `responses` in order and records each request. */
export function mockFetch(responses: (Response | Error)[]) {
  const calls: RecordedCall[] = [];
  let i = 0;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({
      url,
      init: init ?? {},
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    const next = responses[Math.min(i++, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next.clone();
  }) as typeof fetch;
  return { impl, calls };
}

export function anthropicMessage(text: string, extra: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 812, output_tokens: 64 },
    ...extra,
  };
}

export function openaiCompletion(text: string, extra: Record<string, unknown> = {}) {
  return {
    id: "chatcmpl_test",
    object: "chat.completion",
    model: "gpt-5-mini-2025-08-07",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: text } }],
    usage: { prompt_tokens: 700, completion_tokens: 90, total_tokens: 790 },
    ...extra,
  };
}

export const noSleep = async () => {};
