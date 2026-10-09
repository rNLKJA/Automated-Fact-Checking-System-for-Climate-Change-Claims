"use client";

import {
  Check,
  KeyRound,
  LoaderCircle,
  PencilLine,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import { VerdictBadge } from "@/components/common/verdict";
import { Button } from "@/components/ui/button";
import { getAuditStore, type HumanDecision } from "@/lib/ai/audit-log";
import { runFactCheck, type FactCheckResult, type Passage } from "@/lib/ai/fact-check";
import { modelOption, PROVIDERS } from "@/lib/ai/providers";
import { activeModel } from "@/lib/ai/settings";
import { evidenceNumber } from "@/lib/format";
import { LABEL_TEXT, LABELS, type Label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { AiGeneratedBadge } from "./ai-badge";
import { useAi } from "./ai-context";

export type EvidenceOption = {
  key: string;
  label: string;
  passages: Passage[];
  /** the 2024 model's verdict on these same passages, to compare like with like */
  modelLabel?: Label;
};

/**
 * Ask the visitor's own LLM for a verdict on this claim and evidence, then let
 * the visitor accept, edit or reject it. The call, its output and the decision
 * all go to the AI audit log in this browser.
 */
export function SecondOpinion({
  claim,
  claimId,
  options,
  goldLabel,
  className,
}: {
  claim: string;
  claimId?: string;
  options: EvidenceOption[];
  /** the annotators' label, when known, to compare against */
  goldLabel?: Label | null;
  className?: string;
}) {
  const { settings, hasKey, openSettings } = useAi();
  const id = useId();
  const [which, setWhich] = useState(options[0]?.key ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<FactCheckResult | null>(null);
  const [usedOption, setUsedOption] = useState<EvidenceOption | null>(null);
  const [decision, setDecision] = useState<HumanDecision>("pending");
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState<Label>("NOT_ENOUGH_INFO");
  const [note, setNote] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const option = options.find((o) => o.key === which) ?? options[0];
  const model = modelOption(settings.provider, activeModel(settings));

  async function ask() {
    if (!hasKey) {
      openSettings();
      return;
    }
    if (!option) return;
    setPending(true);
    setResult(null);
    setDecision("pending");
    setEditing(false);
    setSaveError(null);
    const ctrl = new AbortController();
    controller.current = ctrl;
    const store = getAuditStore();
    try {
      await store.list();
    } catch {
      setPending(false);
      setSaveError(
        "This browser cannot keep the AI audit log (IndexedDB is unavailable), so no model is called.",
      );
      return;
    }
    try {
      const r = await runFactCheck({
        settings,
        claim,
        passages: option.passages,
        feature: "second-opinion",
        meta: { claim_id: claimId ?? null, evidence: option.key },
        store,
        signal: ctrl.signal,
      });
      setResult(r);
      setUsedOption(option);
      if (r.status === "ok") setEditLabel(r.label);
    } catch {
      // stopped by the visitor
    } finally {
      setPending(false);
      controller.current = null;
    }
  }

  async function decide(d: Exclude<HumanDecision, "pending">) {
    if (!result || result.status === "error") return;
    try {
      await getAuditStore().decide(result.auditId, {
        decision: d,
        edited_output: d === "edited" ? { label: editLabel } : undefined,
        decision_note: note,
      });
      setDecision(d);
      setEditing(false);
      setSaveError(null);
    } catch {
      setSaveError("Could not save the decision to the AI log in this browser.");
    }
  }

  return (
    <section
      aria-labelledby={`${id}-h`}
      className={cn(
        "space-y-4 rounded-2xl border border-dashed border-border bg-card/60 p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Optional · uses your own API key
          </p>
          <h2 id={`${id}-h`} className="mt-1 font-serif text-2xl font-medium">
            Second opinion from an LLM
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The model reads this claim and the evidence passages shown on this page, picks one of
            the four verdicts and cites the passages it used. It is told to judge from the passages
            only. You review the answer; the call and your decision go to the{" "}
            <Link href="/ai-log" className="text-foreground underline underline-offset-4">
              AI audit log
            </Link>{" "}
            in this browser.
          </p>
        </div>
      </div>

      {options.length > 1 && (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Evidence to send</legend>
          <span aria-hidden className="text-xs text-muted-foreground">
            Evidence
          </span>
          <div className="inline-flex flex-wrap rounded-lg border border-border bg-background p-0.5">
            {options.map((o) => (
              <label
                key={o.key}
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
                  which === o.key
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={`${id}-evidence`}
                  value={o.key}
                  checked={which === o.key}
                  disabled={pending}
                  onChange={() => setWhich(o.key)}
                />
                {o.label} ({o.passages.length})
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {pending ? (
          <Button variant="outline" onClick={() => controller.current?.abort()}>
            <LoaderCircle aria-hidden className="animate-spin" /> Asking… (stop)
          </Button>
        ) : (
          <Button onClick={ask} variant={hasKey ? "default" : "outline"}>
            {hasKey ? <Sparkles aria-hidden /> : <KeyRound aria-hidden />}
            {hasKey ? `Ask ${model.label}` : "Add your key to ask an LLM"}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {hasKey
            ? `Sends the claim and ${option?.passages.length ?? 0} passages to ${PROVIDERS[settings.provider].host}.`
            : "Without a key nothing is sent anywhere. The rest of the site does not need one."}
        </p>
      </div>

      {saveError && (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {saveError}
        </p>
      )}

      <div aria-live="polite">
        {result?.status === "error" && (
          <p
            role="alert"
            className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2 text-sm"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              {result.message}
              {result.kind === "invalid_key" && (
                <Button variant="link" size="sm" className="h-auto px-1" onClick={openSettings}>
                  Open AI settings
                </Button>
              )}
            </span>
          </p>
        )}
        {result?.status === "invalid_output" && (
          <p className="rounded-lg border border-nei/45 bg-nei/10 px-3 py-2 text-sm">
            The model answered, but not in a usable form: {result.message} The raw answer is in the
            AI log.
          </p>
        )}
        {result?.status === "ok" && usedOption && (
          <div className="space-y-4 rounded-xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
              <AiGeneratedBadge model={result.model} />
              <span className="text-xs text-muted-foreground tabular">
                {(result.latencyMs / 1000).toFixed(1)} s
                {result.usage.inputTokens !== null &&
                  ` · ${result.usage.inputTokens} + ${result.usage.outputTokens ?? 0} tokens`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge label={result.label} size="lg" />
              {goldLabel && (
                <span className="text-sm text-muted-foreground">
                  {result.label === goldLabel
                    ? "matches the annotators' label"
                    : `annotators said ${LABEL_TEXT[goldLabel].short.toLowerCase()}`}
                </span>
              )}
              {usedOption.modelLabel && (
                <span className="text-sm text-muted-foreground">
                  · the 2024 model, on the same evidence, said{" "}
                  {LABEL_TEXT[usedOption.modelLabel].short.toLowerCase()}
                </span>
              )}
            </div>
            <p className="font-serif text-lg leading-relaxed">{result.rationale}</p>
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">Passages it cited</p>
              {result.cited.length === 0 ? (
                <p className="text-muted-foreground">None.</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {result.citations.valid.map((e) => (
                    <li key={e} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      evidence-{evidenceNumber(e)}
                    </li>
                  ))}
                  {result.citations.invalid.map((e) => (
                    <li
                      key={e}
                      className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive"
                      title="Not one of the passages it was shown"
                    >
                      {e} (not shown to it)
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 border-t border-border pt-3">
              {decision === "pending" ? (
                <>
                  <p className="text-sm font-medium">Your review</p>
                  {editing ? (
                    <div className="space-y-2">
                      <label htmlFor={`${id}-edit`} className="text-xs text-muted-foreground">
                        The verdict you would give
                      </label>
                      <select
                        id={`${id}-edit`}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value as Label)}
                        className="h-9 w-full max-w-xs rounded-lg border border-input bg-background px-2 text-sm"
                      >
                        {LABELS.map((l) => (
                          <option key={l} value={l}>
                            {LABEL_TEXT[l].short}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <label htmlFor={`${id}-note`} className="text-xs text-muted-foreground">
                      Note (optional, stored in the AI log)
                    </label>
                    <input
                      id={`${id}-note`}
                      value={note}
                      maxLength={500}
                      onChange={(e) => setNote(e.target.value)}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editing ? (
                      <>
                        <Button size="sm" onClick={() => decide("edited")}>
                          Save edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => decide("accepted")}>
                          <Check aria-hidden /> Accept
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                          <PencilLine aria-hidden /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decide("rejected")}>
                          <X aria-hidden /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm">
                  Recorded as <span className="font-medium">{decision}</span>
                  {decision === "edited" && ` (${LABEL_TEXT[editLabel].short.toLowerCase()})`} in
                  the{" "}
                  <Link href="/ai-log" className="underline underline-offset-4">
                    AI audit log
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
