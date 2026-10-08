/**
 * The AI audit log: one record per model call, kept in the visitor's browser
 * (IndexedDB; this site has no database to write to) and viewable at /ai-log.
 *
 * A record holds what was sent (system prompt, user message, metadata), what
 * came back, how long it took, the token usage the provider reported, and the
 * human decision on the output. It never holds the API key: `newAuditEntry`
 * scrubs the key from every string before the record is stored.
 */
import { toCsv } from "../csv";
import type { ProviderId } from "./providers";

export type AiFeature = "llm-eval" | "second-opinion";

export const FEATURE_LABEL: Record<AiFeature, string> = {
  "llm-eval": "LLM evaluation harness",
  "second-opinion": "Second opinion",
};

export type HumanDecision = "pending" | "accepted" | "edited" | "rejected";

export type AuditEntry = {
  id: string;
  /** ISO 8601 */
  timestamp: string;
  feature: AiFeature;
  provider: ProviderId;
  /** model id requested (and the one the provider reported, if different) */
  model: string;
  input: { system: string; user: string; meta: Record<string, unknown> };
  /** the validated output, or null when the call failed */
  output: unknown;
  /** the raw text, kept when the output could not be validated */
  raw_output: string | null;
  error: { kind: string; message: string } | null;
  latency_ms: number | null;
  usage: { input_tokens: number | null; output_tokens: number | null } | null;
  decision: HumanDecision;
  /** the human's corrected output, when the decision is "edited" */
  edited_output: unknown;
  decision_note: string | null;
  decided_at: string | null;
};

export const AUDIT_COLUMNS = [
  "id",
  "timestamp",
  "feature",
  "provider",
  "model",
  "input",
  "output",
  "raw_output",
  "error",
  "latency_ms",
  "usage",
  "decision",
  "edited_output",
  "decision_note",
  "decided_at",
] as const satisfies readonly (keyof AuditEntry)[];

/** Replace every occurrence of each secret in any string inside `value`. */
export function redactSecrets<T>(value: T, secrets: readonly string[]): T {
  const live = secrets.map((s) => s.trim()).filter((s) => s.length >= 8);
  if (live.length === 0) return value;
  const scrub = (v: unknown): unknown => {
    if (typeof v === "string") {
      return live.reduce((acc, s) => acc.split(s).join("[redacted key]"), v);
    }
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]));
    }
    return v;
  };
  return scrub(value) as T;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type NewAuditEntry = Omit<
  AuditEntry,
  "id" | "timestamp" | "decision" | "edited_output" | "decision_note" | "decided_at"
> & { timestamp?: string };

/** Build a record, scrubbing the API key from everything in it. */
export function newAuditEntry(fields: NewAuditEntry, apiKey: string): AuditEntry {
  const entry: AuditEntry = {
    id: uuid(),
    timestamp: fields.timestamp ?? new Date().toISOString(),
    feature: fields.feature,
    provider: fields.provider,
    model: fields.model,
    input: fields.input,
    output: fields.output,
    raw_output: fields.raw_output,
    error: fields.error,
    latency_ms: fields.latency_ms === null ? null : Math.round(fields.latency_ms),
    usage: fields.usage,
    decision: "pending",
    edited_output: null,
    decision_note: null,
    decided_at: null,
  };
  return redactSecrets(entry, [apiKey]);
}

export type DecisionPatch = {
  decision: Exclude<HumanDecision, "pending">;
  edited_output?: unknown;
  decision_note?: string | null;
};

export function applyDecision(
  entry: AuditEntry,
  patch: DecisionPatch,
  at = new Date(),
): AuditEntry {
  return {
    ...entry,
    decision: patch.decision,
    edited_output: patch.decision === "edited" ? (patch.edited_output ?? null) : null,
    decision_note: patch.decision_note?.trim() ? patch.decision_note.trim() : null,
    decided_at: at.toISOString(),
  };
}

export interface AuditStore {
  add(entry: AuditEntry): Promise<void>;
  /** newest first */
  list(): Promise<AuditEntry[]>;
  get(id: string): Promise<AuditEntry | undefined>;
  decide(id: string, patch: DecisionPatch): Promise<AuditEntry | undefined>;
  clear(): Promise<void>;
}

function newestFirst(a: AuditEntry, b: AuditEntry) {
  return b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id);
}

export function createMemoryAuditStore(initial: AuditEntry[] = []): AuditStore {
  const rows = new Map(initial.map((e) => [e.id, e]));
  return {
    async add(entry) {
      rows.set(entry.id, entry);
    },
    async list() {
      return [...rows.values()].sort(newestFirst);
    },
    async get(id) {
      return rows.get(id);
    },
    async decide(id, patch) {
      const e = rows.get(id);
      if (!e) return undefined;
      const next = applyDecision(e, patch);
      rows.set(id, next);
      return next;
    },
    async clear() {
      rows.clear();
    },
  };
}

const DB_NAME = "climate-claim-checker";
const STORE = "ai_audit_log";

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** The browser store. `factory` is injectable so tests can use fake-indexeddb. */
export function createIndexedDbAuditStore(factory?: IDBFactory, dbName = DB_NAME): AuditStore {
  let dbp: Promise<IDBDatabase> | undefined;
  const db = () => {
    dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const f = factory ?? globalThis.indexedDB;
      if (!f) return reject(new Error("This browser has no IndexedDB, so the log cannot be kept."));
      const req = f.open(dbName, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  };
  return {
    async add(entry) {
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      await done(tx);
    },
    async list() {
      const tx = (await db()).transaction(STORE, "readonly");
      const all = (await promisify(tx.objectStore(STORE).getAll())) as AuditEntry[];
      return all.sort(newestFirst);
    },
    async get(id) {
      const tx = (await db()).transaction(STORE, "readonly");
      return (await promisify(tx.objectStore(STORE).get(id))) as AuditEntry | undefined;
    },
    async decide(id, patch) {
      const tx = (await db()).transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const e = (await promisify(store.get(id))) as AuditEntry | undefined;
      if (!e) {
        await done(tx);
        return undefined;
      }
      const next = applyDecision(e, patch);
      store.put(next);
      await done(tx);
      return next;
    },
    async clear() {
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      await done(tx);
    },
  };
}

let browserStore: AuditStore | undefined;

/** The visitor's log (lazily opened on first use, in the browser only). */
export function getAuditStore(): AuditStore {
  browserStore ??= createIndexedDbAuditStore();
  return browserStore;
}

export function auditToJson(entries: readonly AuditEntry[]): string {
  return JSON.stringify(
    { exported_at: new Date().toISOString(), entries, count: entries.length },
    null,
    2,
  );
}

export function auditToCsv(entries: readonly AuditEntry[]): string {
  return toCsv(entries as unknown as Record<string, unknown>[], AUDIT_COLUMNS);
}
