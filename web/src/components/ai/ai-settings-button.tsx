"use client";

import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PROVIDERS } from "@/lib/ai/providers";
import { cn } from "@/lib/utils";
import { useAi } from "./ai-context";

/**
 * Header button: opens AI settings; a dot shows when a key is set for the chosen
 * provider. The server render (and hydration) always shows "no key".
 */
export function AiSettingsButton() {
  const { settings, hasKey, openSettings } = useAi();
  const label = hasKey
    ? `AI settings: ${PROVIDERS[settings.provider].label} key set`
    : "AI settings: optional, bring your own key";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={openSettings}
      aria-label={label}
      title={label}
      className="relative"
    >
      <KeyRound aria-hidden />
      <span
        aria-hidden
        className={cn(
          "absolute top-1 right-1 size-2 rounded-full ring-2 ring-background transition-opacity",
          hasKey ? "bg-hit opacity-100" : "opacity-0",
        )}
      />
    </Button>
  );
}
