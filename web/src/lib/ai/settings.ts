/**
 * The visitor's AI settings and where they live in the browser.
 *
 * - Keys are kept per provider in sessionStorage by default (gone when the tab
 *   closes), or in localStorage only if the visitor ticks "remember on this
 *   device". A key is never in both.
 * - Non-secret preferences (provider, model, remember) live in localStorage.
 * - Nothing here is ever sent to this site's server.
 */
import {
  ANTHROPIC_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  type ProviderId,
} from "./providers";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AiSettings = {
  provider: ProviderId;
  anthropicModel: string;
  openaiModel: string;
  keys: Record<ProviderId, string>;
  remember: boolean;
};

export const DEFAULT_SETTINGS: AiSettings = {
  provider: "anthropic",
  anthropicModel: DEFAULT_ANTHROPIC_MODEL,
  openaiModel: DEFAULT_OPENAI_MODEL,
  keys: { anthropic: "", openai: "" },
  remember: false,
};

export const STORAGE_KEYS = {
  prefs: "ccc.ai.prefs.v1",
  key: (p: ProviderId) => `ccc.ai.key.${p}`,
} as const;

const PROVIDER_IDS: readonly ProviderId[] = ["anthropic", "openai"];

function safeGet(s: StorageLike | null, key: string): string | null {
  try {
    return s?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(s: StorageLike | null, key: string, value: string) {
  try {
    s?.setItem(key, value);
  } catch {
    // storage full or blocked (private mode): the setting simply does not persist
  }
}

function safeRemove(s: StorageLike | null, key: string) {
  try {
    s?.removeItem(key);
  } catch {
    // ignore
  }
}

/** A plausible model id: letters, digits, dots, dashes, underscores, colons and slashes. */
export function isPlausibleModelId(id: string): boolean {
  return /^[A-Za-z0-9][\w.:/-]{0,99}$/.test(id);
}

export function readSettings(session: StorageLike | null, local: StorageLike | null): AiSettings {
  let prefs: Partial<AiSettings> = {};
  try {
    const raw = safeGet(local, STORAGE_KEYS.prefs);
    if (raw) prefs = JSON.parse(raw) as Partial<AiSettings>;
  } catch {
    prefs = {};
  }
  const provider: ProviderId = prefs.provider === "openai" ? "openai" : "anthropic";
  const anthropicModel = ANTHROPIC_MODELS.some((m) => m.id === prefs.anthropicModel)
    ? (prefs.anthropicModel as string)
    : DEFAULT_ANTHROPIC_MODEL;
  const openaiModel =
    typeof prefs.openaiModel === "string" && isPlausibleModelId(prefs.openaiModel)
      ? prefs.openaiModel
      : DEFAULT_OPENAI_MODEL;
  const remember = prefs.remember === true;
  const keys = Object.fromEntries(
    PROVIDER_IDS.map((p) => [
      p,
      safeGet(remember ? local : session, STORAGE_KEYS.key(p)) ??
        safeGet(remember ? session : local, STORAGE_KEYS.key(p)) ??
        "",
    ]),
  ) as Record<ProviderId, string>;
  return { provider, anthropicModel, openaiModel, keys, remember };
}

/** Persist settings: preferences to localStorage, each key to exactly one storage. */
export function writeSettings(
  settings: AiSettings,
  session: StorageLike | null,
  local: StorageLike | null,
) {
  const { provider, anthropicModel, openaiModel, remember } = settings;
  safeSet(
    local,
    STORAGE_KEYS.prefs,
    JSON.stringify({ provider, anthropicModel, openaiModel, remember }),
  );
  for (const p of PROVIDER_IDS) {
    const key = settings.keys[p].trim();
    const keep = remember ? local : session;
    const drop = remember ? session : local;
    safeRemove(drop, STORAGE_KEYS.key(p));
    if (key) safeSet(keep, STORAGE_KEYS.key(p), key);
    else safeRemove(keep, STORAGE_KEYS.key(p));
  }
}

/** Remove every stored key from both storages (preferences are kept). */
export function forgetKeys(session: StorageLike | null, local: StorageLike | null) {
  for (const p of PROVIDER_IDS) {
    safeRemove(session, STORAGE_KEYS.key(p));
    safeRemove(local, STORAGE_KEYS.key(p));
  }
}

export function activeModel(s: AiSettings): string {
  return s.provider === "anthropic" ? s.anthropicModel : s.openaiModel;
}

export function activeKey(s: AiSettings): string {
  return s.keys[s.provider].trim();
}

export function hasActiveKey(s: AiSettings): boolean {
  return activeKey(s).length > 0;
}

/** "sk-ant-…9f2c": enough to recognise a key without revealing it. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return "•".repeat(k.length);
  const prefix = k.startsWith("sk-ant-") ? "sk-ant-" : k.startsWith("sk-") ? "sk-" : "";
  return `${prefix}…${k.slice(-4)}`;
}
