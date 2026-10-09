/**
 * A tiny external store over the browser storages, for `useSyncExternalStore`:
 * every component that needs the AI settings (header button, dialog, harness,
 * second-opinion panels) sees the same snapshot and re-renders on change,
 * including changes made in another tab (localStorage `storage` events).
 */
import {
  DEFAULT_SETTINGS,
  forgetKeys,
  readSettings,
  writeSettings,
  type AiSettings,
  type StorageLike,
} from "./settings";

export type SettingsStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AiSettings;
  getServerSnapshot: () => AiSettings;
  save: (next: AiSettings) => void;
  forget: () => void;
};

export function createSettingsStore(
  storages: () => { session: StorageLike | null; local: StorageLike | null },
  onExternalChange?: (notify: () => void) => () => void,
): SettingsStore {
  let snapshot: AiSettings | null = null;
  let stopExternal: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const refresh = () => {
    const { session, local } = storages();
    snapshot = readSettings(session, local);
    listeners.forEach((l) => l());
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) stopExternal = onExternalChange?.(refresh);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopExternal?.();
          stopExternal = undefined;
        }
      };
    },
    getSnapshot() {
      if (!snapshot) {
        const { session, local } = storages();
        snapshot = readSettings(session, local);
      }
      return snapshot;
    },
    getServerSnapshot: () => DEFAULT_SETTINGS,
    save(next) {
      const { session, local } = storages();
      writeSettings(next, session, local);
      refresh();
    },
    forget() {
      const { session, local } = storages();
      forgetKeys(session, local);
      refresh();
    },
  };
}

function browserStorages() {
  if (typeof window === "undefined") return { session: null, local: null };
  const get = (k: "sessionStorage" | "localStorage") => {
    try {
      return window[k];
    } catch {
      return null;
    }
  };
  return { session: get("sessionStorage"), local: get("localStorage") };
}

/** The app-wide store (browser storages; harmless on the server). */
export const aiSettingsStore = createSettingsStore(browserStorages, (notify) => {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith("ccc.ai.")) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
});
