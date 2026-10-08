"use client";

import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ANTHROPIC_MODELS,
  DEFAULT_OPENAI_MODEL,
  PROVIDERS,
  type ProviderId,
} from "@/lib/ai/providers";
import { isPlausibleModelId, maskKey, type AiSettings } from "@/lib/ai/settings";
import { aiSettingsStore } from "@/lib/ai/settings-store";
import { cn } from "@/lib/utils";

export function AiSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <SettingsForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted each time the dialog opens, so the draft starts from the saved settings. */
function SettingsForm({ onDone }: { onDone: () => void }) {
  const saved = useSyncExternalStore(
    aiSettingsStore.subscribe,
    aiSettingsStore.getSnapshot,
    aiSettingsStore.getServerSnapshot,
  );
  const [draft, setDraft] = useState<AiSettings>(saved);
  const [reveal, setReveal] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const id = useId();
  const provider = draft.provider;
  const p = PROVIDERS[provider];
  const key = draft.keys[provider];
  const storedAny = saved.keys.anthropic !== "" || saved.keys.openai !== "";
  const modelOk = provider === "anthropic" || isPlausibleModelId(draft.openaiModel.trim());

  const setKey = (value: string) =>
    setDraft((d) => ({ ...d, keys: { ...d.keys, [d.provider]: value } }));

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!modelOk) return;
        aiSettingsStore.save({ ...draft, openaiModel: draft.openaiModel.trim() });
        onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound aria-hidden className="size-5 text-muted-foreground" /> AI settings
        </DialogTitle>
        <DialogDescription>
          AI features on this site are optional and use your own API key. Everything else works
          without one.
        </DialogDescription>
      </DialogHeader>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Provider</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
          {(["anthropic", "openai"] as const).map((value: ProviderId) => (
            <label
              key={value}
              className={cn(
                "cursor-pointer rounded-md px-3 py-2 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
                provider === value
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name={`${id}-provider`}
                value={value}
                checked={provider === value}
                onChange={() => {
                  setDraft((d) => ({ ...d, provider: value }));
                  setReveal(false);
                }}
                className="sr-only"
              />
              {PROVIDERS[value].label}
              {value === "anthropic" && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">default</span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      {provider === "anthropic" ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Model</legend>
          <div className="space-y-1.5">
            {ANTHROPIC_MODELS.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
                  draft.anthropicModel === m.id
                    ? "border-foreground/30 bg-accent/50"
                    : "border-border hover:border-foreground/20",
                )}
              >
                <input
                  type="radio"
                  name={`${id}-model`}
                  value={m.id}
                  checked={draft.anthropicModel === m.id}
                  onChange={() => setDraft((d) => ({ ...d, anthropicModel: m.id }))}
                  className="mt-1 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{m.label}</span>
                    {m.pricing && (
                      <span className="font-mono text-xs text-muted-foreground tabular">
                        ${m.pricing.input} / ${m.pricing.output} per M tokens
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    <code className="font-mono">{m.id}</code> · {m.note}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-openai-model`} className="text-sm font-medium">
            Model id
          </label>
          <input
            id={`${id}-openai-model`}
            value={draft.openaiModel}
            onChange={(e) => setDraft((d) => ({ ...d, openaiModel: e.target.value }))}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!modelOk}
            aria-describedby={`${id}-openai-help`}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
          <p id={`${id}-openai-help`} className="text-xs text-muted-foreground">
            Any Chat Completions model that supports JSON-schema output. Default{" "}
            <code className="font-mono">{DEFAULT_OPENAI_MODEL}</code>.
            {!modelOk && " That does not look like a model id."}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${id}-key`} className="text-sm font-medium">
          Your {p.label} API key
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-key`}
            type={reveal ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={p.keyHint}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-1p-ignore
            data-lpignore="true"
            aria-describedby={`${id}-key-help`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide key" : "Show key"}
            aria-pressed={reveal}
          >
            {reveal ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
        </div>
        <p id={`${id}-key-help`} className="text-xs text-muted-foreground">
          {saved.keys[provider]
            ? `Saved key: ${maskKey(saved.keys[provider])}. `
            : "No key saved for this provider. "}
          Create one at{" "}
          <a
            href={p.keysUrl}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-4"
          >
            {new URL(p.keysUrl).host}
          </a>
          ; a key with a low spending limit is a good idea.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={draft.remember}
          onChange={(e) => setDraft((d) => ({ ...d, remember: e.target.checked }))}
          className="mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium">Remember on this device</span>
          <span className="block text-xs text-muted-foreground">
            Off: the key is kept for this tab only (sessionStorage) and is gone when you close it.
            On: it stays in this browser&rsquo;s localStorage until you forget it.
          </span>
        </span>
      </label>

      <div className="flex gap-2.5 rounded-xl border border-hit/40 bg-hit/8 p-3 text-xs leading-relaxed">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-hit" />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Your key never reaches this site.</span>{" "}
          Requests go straight from your browser to{" "}
          <span className="font-mono text-foreground">{p.host}</span>. The key is not sent to our
          server, not logged and not written to the{" "}
          <Link href="/ai-log" onClick={onDone} className="text-foreground underline">
            AI audit log
          </Link>
          . Read{" "}
          <Link href="/methods#ai-use" onClick={onDone} className="text-foreground underline">
            how AI is used here
          </Link>
          .
        </p>
      </div>

      <DialogFooter className="items-center sm:justify-between">
        {storedAny ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (!confirmForget) {
                setConfirmForget(true);
                return;
              }
              aiSettingsStore.forget();
              setDraft((d) => ({ ...d, keys: { anthropic: "", openai: "" } }));
              setConfirmForget(false);
            }}
          >
            {confirmForget ? "Click again to forget all keys" : "Forget keys"}
          </Button>
        ) : (
          <span aria-hidden />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" size="lg" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={!modelOk}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
