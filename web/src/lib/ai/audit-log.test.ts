import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "../csv";
import {
  applyDecision,
  AUDIT_COLUMNS,
  auditToCsv,
  auditToJson,
  createIndexedDbAuditStore,
  createMemoryAuditStore,
  newAuditEntry,
  redactSecrets,
  type AuditEntry,
  type AuditStore,
  type NewAuditEntry,
} from "./audit-log";

const KEY = "sk-ant-api03-SECRET-KEY-VALUE-1234";

function fields(over: Partial<NewAuditEntry> = {}): NewAuditEntry {
  return {
    feature: "llm-eval",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    input: { system: "sys", user: "claim text", meta: { claim_id: "claim-752" } },
    output: { label: "SUPPORTS", evidence_ids: ["evidence-1"], rationale: "ok" },
    raw_output: null,
    error: null,
    latency_ms: 812.4,
    usage: { input_tokens: 800, output_tokens: 60 },
    ...over,
  };
}

describe("audit entries", () => {
  it("have every governance field, start pending and round latency", () => {
    const e = newAuditEntry(fields({ timestamp: "2026-10-06T00:00:00.000Z" }), KEY);
    expect(Object.keys(e).sort()).toEqual([...AUDIT_COLUMNS].sort());
    expect(e.decision).toBe("pending");
    expect(e.latency_ms).toBe(812);
    expect(e.timestamp).toBe("2026-10-06T00:00:00.000Z");
    expect(e.id).toMatch(/[0-9a-f-]{8,}/);
  });

  it("never stores the API key, wherever it appears", () => {
    const leaky = fields({
      input: { system: `key=${KEY}`, user: "x", meta: { nested: [KEY, { k: KEY }] } },
      error: { kind: "invalid_key", message: `Incorrect API key provided: ${KEY}` },
      raw_output: KEY,
    });
    const e = newAuditEntry(leaky, KEY);
    expect(JSON.stringify(e)).not.toContain(KEY);
    expect(JSON.stringify(e)).toContain("[redacted key]");
    // short or empty "secrets" are not used for redaction (would mangle normal text)
    expect(redactSecrets({ a: "abc" }, ["", "ab"])).toEqual({ a: "abc" });
  });

  it("records human decisions, keeping an edit only for 'edited'", () => {
    const e = newAuditEntry(fields(), KEY);
    const at = new Date("2026-10-06T01:02:03.000Z");
    const edited = applyDecision(
      e,
      { decision: "edited", edited_output: { label: "REFUTES" }, decision_note: "  wrong  " },
      at,
    );
    expect(edited).toMatchObject({
      decision: "edited",
      edited_output: { label: "REFUTES" },
      decision_note: "wrong",
      decided_at: "2026-10-06T01:02:03.000Z",
    });
    const rejected = applyDecision(edited, { decision: "rejected", edited_output: { x: 1 } }, at);
    expect(rejected.edited_output).toBeNull();
    expect(rejected.decision_note).toBeNull();
  });
});

async function exercise(store: AuditStore) {
  const a = newAuditEntry(fields({ timestamp: "2026-10-06T00:00:01.000Z" }), KEY);
  const b = newAuditEntry(
    fields({ timestamp: "2026-10-06T00:00:02.000Z", feature: "second-opinion" }),
    KEY,
  );
  await store.add(a);
  await store.add(b);
  expect((await store.list()).map((e) => e.id)).toEqual([b.id, a.id]);
  const decided = await store.decide(a.id, { decision: "accepted" });
  expect(decided?.decision).toBe("accepted");
  expect((await store.get(a.id))?.decision).toBe("accepted");
  expect(await store.decide("missing", { decision: "rejected" })).toBeUndefined();
  await store.clear();
  expect(await store.list()).toEqual([]);
}

describe("audit stores", () => {
  it("in memory", async () => {
    await exercise(createMemoryAuditStore());
  });

  it("in IndexedDB (fake-indexeddb)", async () => {
    await exercise(createIndexedDbAuditStore(new IDBFactory(), "test-db"));
  });

  it("explains when IndexedDB is unavailable", async () => {
    const store = createIndexedDbAuditStore(undefined, "nope");
    const had = globalThis.indexedDB;
    // vitest runs in node, where there is no IndexedDB
    expect(had).toBeUndefined();
    await expect(store.list()).rejects.toThrow(/IndexedDB/);
  });
});

describe("exports", () => {
  it("CSV quotes, escapes and defuses spreadsheet formulas", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(3)).toBe("3");
    expect(csvCell(true)).toBe("true");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell({ a: [1, 2] })).toBe('"{""a"":[1,2]}"');
    expect(toCsv([{ a: 1, b: "x" }], ["a", "b"])).toBe("a,b\r\n1,x\r\n");
  });

  it("exports the log as JSON and CSV with one row per call", () => {
    const entries: AuditEntry[] = [newAuditEntry(fields(), KEY), newAuditEntry(fields(), KEY)];
    const json = JSON.parse(auditToJson(entries)) as { count: number; entries: AuditEntry[] };
    expect(json.count).toBe(2);
    expect(json.entries[0].id).toBe(entries[0].id);
    const csv = auditToCsv(entries);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(AUDIT_COLUMNS.join(","));
    expect(lines).toHaveLength(3);
    expect(csv).not.toContain(KEY);
  });
});
