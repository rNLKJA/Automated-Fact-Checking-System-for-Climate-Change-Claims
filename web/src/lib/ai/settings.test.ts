import { describe, expect, it, vi } from "vitest";

import {
  activeKey,
  activeModel,
  DEFAULT_SETTINGS,
  forgetKeys,
  hasActiveKey,
  isPlausibleModelId,
  maskKey,
  readSettings,
  STORAGE_KEYS,
  writeSettings,
  type StorageLike,
} from "./settings";
import { createSettingsStore } from "./settings-store";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const KEY = "sk-ant-api03-abcdefghijklmnop-9f2c";

describe("AI settings storage", () => {
  it("defaults to Anthropic Haiku with no key", () => {
    const s = readSettings(new MemoryStorage(), new MemoryStorage());
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(activeModel(s)).toBe("claude-haiku-4-5");
    expect(hasActiveKey(s)).toBe(false);
  });

  it("keeps the key in sessionStorage unless the visitor opts in to remembering it", () => {
    const session = new MemoryStorage();
    const local = new MemoryStorage();
    writeSettings({ ...DEFAULT_SETTINGS, keys: { anthropic: KEY, openai: "" } }, session, local);
    expect(session.getItem(STORAGE_KEYS.key("anthropic"))).toBe(KEY);
    expect(local.getItem(STORAGE_KEYS.key("anthropic"))).toBeNull();
    expect(local.getItem(STORAGE_KEYS.prefs)).not.toContain(KEY);
    expect(activeKey(readSettings(session, local))).toBe(KEY);

    writeSettings(
      { ...DEFAULT_SETTINGS, remember: true, keys: { anthropic: KEY, openai: "" } },
      session,
      local,
    );
    expect(local.getItem(STORAGE_KEYS.key("anthropic"))).toBe(KEY);
    expect(session.getItem(STORAGE_KEYS.key("anthropic"))).toBeNull();
    expect(readSettings(session, local).remember).toBe(true);
  });

  it("forgets keys from both storages but keeps preferences", () => {
    const session = new MemoryStorage();
    const local = new MemoryStorage();
    writeSettings(
      {
        ...DEFAULT_SETTINGS,
        provider: "openai",
        openaiModel: "gpt-4.1-mini",
        keys: { anthropic: KEY, openai: "sk-proj-123456789" },
      },
      session,
      local,
    );
    forgetKeys(session, local);
    const s = readSettings(session, local);
    expect(s.keys).toEqual({ anthropic: "", openai: "" });
    expect(s.provider).toBe("openai");
    expect(activeModel(s)).toBe("gpt-4.1-mini");
  });

  it("ignores corrupt or hostile stored preferences", () => {
    const local = new MemoryStorage();
    local.setItem(STORAGE_KEYS.prefs, "{not json");
    expect(readSettings(null, local)).toEqual(DEFAULT_SETTINGS);
    local.setItem(
      STORAGE_KEYS.prefs,
      JSON.stringify({ provider: "evil", anthropicModel: "claude-x", openaiModel: "<script>" }),
    );
    expect(readSettings(null, local)).toEqual(DEFAULT_SETTINGS);
    expect(isPlausibleModelId("gpt-5-mini")).toBe(true);
    expect(isPlausibleModelId("ft:gpt-4o:org/name")).toBe(true);
    expect(isPlausibleModelId("bad id")).toBe(false);
  });

  it("survives storages that throw (blocked cookies, private mode)", () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSettings(throwing, throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => writeSettings(DEFAULT_SETTINGS, throwing, throwing)).not.toThrow();
    expect(() => forgetKeys(throwing, throwing)).not.toThrow();
  });

  it("masks keys for display", () => {
    expect(maskKey(KEY)).toBe("sk-ant-…9f2c");
    expect(maskKey("sk-proj-abcdef123456")).toBe("sk-…3456");
    expect(maskKey("short")).toBe("•••••");
  });
});

describe("settings store", () => {
  it("shares one stable snapshot and notifies subscribers on save and forget", () => {
    const session = new MemoryStorage();
    const local = new MemoryStorage();
    let external: (() => void) | undefined;
    const stop = vi.fn();
    const store = createSettingsStore(
      () => ({ session, local }),
      (notify) => {
        external = notify;
        return stop;
      },
    );
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.save({ ...first, keys: { anthropic: KEY, openai: "" } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(activeKey(store.getSnapshot())).toBe(KEY);
    store.forget();
    expect(hasActiveKey(store.getSnapshot())).toBe(false);
    // a change in another tab
    local.setItem(STORAGE_KEYS.prefs, JSON.stringify({ provider: "openai" }));
    external?.();
    expect(store.getSnapshot().provider).toBe("openai");
    unsubscribe();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(store.getServerSnapshot()).toEqual(DEFAULT_SETTINGS);
  });
});
