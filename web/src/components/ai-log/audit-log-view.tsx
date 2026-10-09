"use client";

import { Check, Download, PencilLine, RefreshCw, Trash2, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { AiGeneratedBadge } from "@/components/ai/ai-badge";
import { downloadText, fileStamp } from "@/components/common/download";
import { VerdictBadge } from "@/components/common/verdict";
import { Button } from "@/components/ui/button";
import {
  auditToCsv,
  auditToJson,
  FEATURE_LABEL,
  getAuditStore,
  isReviewable,
  substitutedModel,
  type AiFeature,
  type AuditEntry,
  type HumanDecision,
} from "@/lib/ai/audit-log";
import { PROVIDERS } from "@/lib/ai/providers";
import { int } from "@/lib/format";
import { isLabel, LABEL_TEXT, LABELS, type Label } from "@/lib/labels";
import { cn } from "@/lib/utils";

const PAGE = 25;

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; entries: AuditEntry[] };

const DECISION_STYLE: Record<HumanDecision, string> = {
  pending: "bg-muted text-muted-foreground ring-border",
  accepted: "bg-hit/12 ring-hit/40",
  edited: "bg-series-1/12 ring-series-1/35",
  rejected: "bg-refutes/10 ring-refutes/35",
};

/** The model answered, but unusably: nothing to review, and scored as wrong in evaluation. */
const UNUSABLE = new Set(["invalid_output", "refusal", "truncated"]);

function outputLabel(e: AuditEntry): Label | null {
  const o = e.output as { label?: unknown } | null;
  return o && isLabel(o.label) ? o.label : null;
}

export function AuditLogView() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [feature, setFeature] = useState<AiFeature | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  const [confirmClear, setConfirmClear] = useState(false);
  const id = useId();

  const refresh = useCallback(async () => {
    try {
      setLoad({ state: "ready", entries: await getAuditStore().list() });
    } catch {
      setLoad({
        state: "error",
        message:
          "This browser does not allow the log to be stored (IndexedDB is unavailable, for example in some private modes). AI features stay off here.",
      });
    }
  }, []);

  useEffect(() => {
    let live = true;
    getAuditStore()
      .list()
      .then((entries) => live && setLoad({ state: "ready", entries }))
      .catch(
        () =>
          live &&
          setLoad({
            state: "error",
            message:
              "This browser does not allow the log to be stored (IndexedDB is unavailable, for example in some private modes). AI features stay off here.",
          }),
      );
    return () => {
      live = false;
    };
  }, []);

  const entries = useMemo(() => (load.state === "ready" ? load.entries : []), [load]);
  const visible = useMemo(
    () => entries.filter((e) => feature === "all" || e.feature === feature),
    [entries, feature],
  );
  const counts = useMemo(() => {
    const c: Record<HumanDecision, number> = { pending: 0, accepted: 0, edited: 0, rejected: 0 };
    // a failed call has nothing to review, so it never waits for review
    for (const e of entries) if (isReviewable(e)) c[e.decision]++;
    return c;
  }, [entries]);
  const tokens = useMemo(
    () =>
      entries.reduce(
        (a, e) => ({
          input: a.input + (e.usage?.input_tokens ?? 0),
          output: a.output + (e.usage?.output_tokens ?? 0),
        }),
        { input: 0, output: 0 },
      ),
    [entries],
  );

  const replace = (next: AuditEntry) =>
    setLoad((l) =>
      l.state === "ready"
        ? { state: "ready", entries: l.entries.map((e) => (e.id === next.id ? next : e)) }
        : l,
    );

  if (load.state === "loading") {
    return <p className="text-sm text-muted-foreground">Reading the log in this browser…</p>;
  }
  if (load.state === "error") {
    return (
      <p
        role="alert"
        className="flex gap-2.5 rounded-xl border border-destructive/40 bg-destructive/8 p-4 text-sm"
      >
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
        {load.message}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Calls logged" value={int(entries.length)} />
        <Summary
          label="Awaiting review"
          value={int(counts.pending)}
          note={`${counts.accepted} accepted · ${counts.edited} edited · ${counts.rejected} rejected`}
        />
        <Summary
          label="Failed or stopped calls"
          value={int(entries.filter((e) => e.error).length)}
          note="Logged too, with nothing to review."
        />
        <Summary
          label="Tokens reported"
          value={int(tokens.input + tokens.output)}
          note={`${int(tokens.input)} in · ${int(tokens.output)} out`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-feature`} className="text-sm text-muted-foreground">
          Feature
        </label>
        <select
          id={`${id}-feature`}
          value={feature}
          onChange={(e) => {
            setFeature(e.target.value as AiFeature | "all");
            setLimit(PAGE);
          }}
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="all">All</option>
          {(Object.keys(FEATURE_LABEL) as AiFeature[]).map((f) => (
            <option key={f} value={f}>
              {FEATURE_LABEL[f]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw aria-hidden /> Refresh
          </Button>
          <Button
            variant="outline"
            disabled={visible.length === 0}
            onClick={() =>
              downloadText(
                `ai-audit-log-${fileStamp()}.json`,
                auditToJson(visible),
                "application/json",
              )
            }
          >
            <Download aria-hidden /> JSON
          </Button>
          <Button
            variant="outline"
            disabled={visible.length === 0}
            onClick={() =>
              downloadText(`ai-audit-log-${fileStamp()}.csv`, auditToCsv(visible), "text/csv")
            }
          >
            <Download aria-hidden /> CSV
          </Button>
          <Button
            variant="destructive"
            disabled={entries.length === 0}
            onClick={async () => {
              if (!confirmClear) {
                setConfirmClear(true);
                return;
              }
              await getAuditStore().clear();
              setConfirmClear(false);
              await refresh();
            }}
            onBlur={() => setConfirmClear(false)}
          >
            <Trash2 aria-hidden /> {confirmClear ? "Click again to delete the log" : "Clear log"}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
          <p className="font-serif text-xl text-foreground">
            No AI calls logged in this browser yet
          </p>
          <p className="mt-2 max-w-2xl leading-relaxed">
            Add your own key in AI settings (the key icon in the header), then ask for a second
            opinion on any{" "}
            <Link href="/explore" className="text-foreground underline underline-offset-4">
              dev claim
            </Link>{" "}
            or run the{" "}
            <Link href="/evaluation" className="text-foreground underline underline-offset-4">
              LLM evaluation
            </Link>
            . Every call appears here.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {visible.slice(0, limit).map((e) => (
            <li key={e.id}>
              <EntryCard entry={e} onChange={replace} />
            </li>
          ))}
        </ol>
      )}
      {visible.length > limit && (
        <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, visible.length - limit)} more of {visible.length - limit}
        </Button>
      )}
    </div>
  );
}

function Summary({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-3xl font-medium tabular">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function EntryCard({
  entry: e,
  onChange,
}: {
  entry: AuditEntry;
  onChange: (e: AuditEntry) => void;
}) {
  const [editing, setEditing] = useState(false);
  const label = outputLabel(e);
  const [editLabel, setEditLabel] = useState<Label>(label ?? "NOT_ENOUGH_INFO");
  const [note, setNote] = useState(e.decision_note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const id = useId();
  const meta = e.input.meta as { claim_id?: unknown; condition?: unknown; evidence?: unknown };
  const claimId = typeof meta.claim_id === "string" ? meta.claim_id : null;
  const edited = e.edited_output as { label?: unknown } | null;
  // records written before these fields existed lack them
  const substitute = substitutedModel(e.model, e.served_model ?? null);
  const attempts = e.attempts ?? null;
  const pill = e.error
    ? e.error.kind === "aborted"
      ? "stopped"
      : UNUSABLE.has(e.error.kind)
        ? "no usable answer"
        : "call failed"
    : e.decision === "pending"
      ? "awaiting review"
      : e.decision;

  async function decide(decision: Exclude<HumanDecision, "pending">) {
    try {
      const next = await getAuditStore().decide(e.id, {
        decision,
        edited_output: decision === "edited" ? { label: editLabel } : undefined,
        decision_note: note,
      });
      if (next) onChange(next);
      setEditing(false);
      setErr(null);
    } catch {
      setErr("Could not save the decision.");
    }
  }

  return (
    <article className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <time dateTime={e.timestamp} className="font-mono tabular">
          {e.timestamp.replace("T", " ").slice(0, 19)} UTC
        </time>
        <span>{FEATURE_LABEL[e.feature]}</span>
        <span>
          {PROVIDERS[e.provider]?.label ?? e.provider} ·{" "}
          <span className="font-mono">{e.model}</span>
          {substitute && (
            <span className="text-destructive">
              {" "}
              (answered by <span className="font-mono">{substitute}</span>)
            </span>
          )}
        </span>
        {attempts !== null && attempts > 1 && <span className="tabular">{attempts} attempts</span>}
        {e.latency_ms !== null && <span className="tabular">{int(e.latency_ms)} ms</span>}
        {e.usage && (
          <span className="tabular">
            {e.usage.input_tokens ?? "?"} + {e.usage.output_tokens ?? "?"} tokens
          </span>
        )}
        <span
          className={cn(
            "ml-auto inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset",
            e.error
              ? "bg-background text-muted-foreground ring-border"
              : DECISION_STYLE[e.decision],
          )}
        >
          {pill}
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {claimId && (
          <Link
            href={`/explore/${claimId}`}
            className="font-mono text-xs underline-offset-4 hover:underline"
            prefetch={false}
          >
            {claimId}
          </Link>
        )}
        {typeof meta.condition === "string" && (
          <span className="text-xs text-muted-foreground">{meta.condition} evidence</span>
        )}
        {typeof meta.evidence === "string" && (
          <span className="text-xs text-muted-foreground">{meta.evidence} evidence</span>
        )}
      </div>

      {e.error ? (
        <p className="text-sm">
          <span className="font-medium text-destructive">{e.error.kind.replace(/_/g, " ")}</span>{" "}
          <span className="text-muted-foreground">{e.error.message}</span>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <AiGeneratedBadge />
          {label && <VerdictBadge label={label} size="sm" />}
          {e.decision === "edited" && edited && isLabel(edited.label) && (
            <span className="text-sm text-muted-foreground">
              → reviewer: <VerdictBadge label={edited.label} size="sm" />
            </span>
          )}
        </div>
      )}
      {e.decision_note && <p className="text-sm text-muted-foreground">Note: {e.decision_note}</p>}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          What was sent and what came back
        </summary>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Input (no API key is ever stored)</p>
            <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-[0.72rem] leading-relaxed whitespace-pre-wrap">
              {e.input.user}
            </pre>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Output</p>
            <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-[0.72rem] leading-relaxed whitespace-pre-wrap">
              {e.output !== null ? JSON.stringify(e.output, null, 2) : (e.raw_output ?? "(none)")}
            </pre>
          </div>
        </div>
      </details>

      {!e.error && (
        <div className="space-y-2 border-t border-border pt-3">
          {editing && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label htmlFor={`${id}-label`} className="text-xs text-muted-foreground">
                  Corrected verdict
                </label>
                <select
                  id={`${id}-label`}
                  value={editLabel}
                  onChange={(ev) => setEditLabel(ev.target.value as Label)}
                  className="block h-8 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  {LABELS.map((l) => (
                    <option key={l} value={l}>
                      {LABEL_TEXT[l].short}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${id}-note`} className="sr-only">
              Review note
            </label>
            <input
              id={`${id}-note`}
              value={note}
              maxLength={500}
              onChange={(ev) => setNote(ev.target.value)}
              placeholder="Review note (optional)"
              className="h-8 min-w-0 flex-1 basis-48 rounded-lg border border-input bg-background px-3 text-sm"
            />
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
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      )}
    </article>
  );
}
