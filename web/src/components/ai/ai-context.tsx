"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import { hasActiveKey, type AiSettings } from "@/lib/ai/settings";
import { aiSettingsStore } from "@/lib/ai/settings-store";
import { AiSettingsDialog } from "./ai-settings-dialog";

type AiContextValue = {
  openSettings: () => void;
};

const AiContext = createContext<AiContextValue>({ openSettings: () => {} });

/**
 * Holds the one AI settings dialog for the whole site. AI features are optional:
 * nothing here runs, and no request is made, until a visitor adds their own key.
 */
export function AiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // The dialog is opened from several buttons rather than one Radix trigger, so
  // remember which control opened it and give focus back there on close.
  const opener = useRef<HTMLElement | null>(null);
  const openSettings = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);
  const restoreFocus = useCallback((event: Event) => {
    const el = opener.current;
    opener.current = null;
    if (el?.isConnected && el !== document.body) {
      event.preventDefault();
      el.focus();
    }
  }, []);
  return (
    <AiContext.Provider value={{ openSettings }}>
      {children}
      <AiSettingsDialog open={open} onOpenChange={setOpen} onCloseAutoFocus={restoreFocus} />
    </AiContext.Provider>
  );
}

/** The visitor's AI settings (server render: defaults, no key) and a way to open the dialog. */
export function useAi(): AiContextValue & { settings: AiSettings; hasKey: boolean } {
  const settings = useSyncExternalStore(
    aiSettingsStore.subscribe,
    aiSettingsStore.getSnapshot,
    aiSettingsStore.getServerSnapshot,
  );
  const { openSettings } = useContext(AiContext);
  return { settings, hasKey: hasActiveKey(settings), openSettings };
}
