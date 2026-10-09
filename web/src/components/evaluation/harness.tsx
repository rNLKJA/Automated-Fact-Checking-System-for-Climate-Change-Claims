"use client";

import {
  Check,
  Download,
  FileUp,
  KeyRound,
  LoaderCircle,
  Play,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";

import { AiGeneratedBadge } from "@/components/ai/ai-badge";
import { useAi } from "@/components/ai/ai-context";
import { downloadText, fileStamp } from "@/components/common/download";
import { VerdictBadge } from "@/components/common/verdict";
import { Button } from "@/components/ui/button";
import { getAuditStore } from "@/lib/ai/audit-log";
import { runFactCheck, type FactCheckResult } from "@/lib/ai/fact-check";
import { estimateCostUsd, modelOption, PROVIDERS } from "@/lib/ai/providers";
import { activeModel, maskKey, type AiSettings } from "@/lib/ai/settings";
import { toCsv } from "@/lib/csv";
import {
  CONDITION_ORDER,
  CONDITIONS,
  HARNESS_BOOTSTRAP,
  HARNESS_DEFAULTS,
  parseRun,
  rowsFor,
  RUN_CSV_COLUMNS,
  runToRows,
  sampleClaims,
  summarizeCondition,
  type Condition,
  type ConditionSummary,
  type HarnessClaim,
  type HarnessClaimSummary,
  type HarnessRun,
  type LlmOutcome,
} from "@/lib/evaluation/harness";
import { claimNumber, fileSafe, fixed, int, pct, pp, pText, range, signed } from "@/lib/format";
import { describeCohensH } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { IntervalBar, ScaleLabels } from "./interval";

type Status = "idle" | "loading" | "running" | "done" | "stopped" | "failed";

/** Errors that will fail every remaining call too: stop the run. */
const FATAL = new Set([
  "no_key",
  "invalid_key",
  "permission",
  "billing",
  "not_found",
  "bad_request",
  "network",
]);
const CONCURRENCY = 2;
/** expected output tokens per call for the cost estimate (Sonnet's include its thinking) */
const OUTPUT_TOKENS: Record<string, number> = { "claude-haiku-4-5": 120, "claude-sonnet-5-5": 600 };

function toOutcome(r: FactCheckResult): LlmOutcome {
  if (r.status === "ok") {
    return {
      status: "ok",
      label: r.label,
      cited: r.cited,
      valid: r.citations.valid,
      invalid: r.citations.invalid,
      rationale: r.rationale,
      latencyMs: r.latencyMs,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      auditId: r.auditId,
    };
  }
  if (r.status === "invalid_output") {
    return {
      status: "invalid_output",
      kind: r.kind,
      message: r.message,
      latencyMs: r.latencyMs,
      inputTokens: r.usage?.inputTokens ?? null,
      outputTokens: r.usage?.outputTokens ?? null,
      auditId: r.auditId,
    };
  }
  return { status: "error", kind: r.kind, message: r.message, auditId: r.auditId };
}

let datasetPromise: Promise<Map<string, HarnessClaim>> | undefined;

/** The evidence text, fetched once from the static /api/dev-set file. */
function loadDataset(): Promise<Map<string, HarnessClaim>> {
  datasetPromise ??= fetch("/api/dev-set")
    .then((r) => {
      if (!r.ok) throw new Error(`dev set request failed (${r.status})`);
      return r.json() as Promise<{ claims: HarnessClaim[] }>;
    })
    .then((j) => new Map(j.claims.map((c) => [c.id, c])))
    .catch((err: unknown) => {
      datasetPromise = undefined;
      throw err;
    });
  return datasetPromise;
}

function clampN(n: number) {
  return Number.isFinite(n) ? Math.max(1, Math.min(154, Math.round(n))) : HARNESS_DEFAULTS.n;
}

export function LlmHarness({ claims }: { claims: HarnessClaimSummary[] }) {
  const { settings, hasKey, openSettings } = useAi();
  const id = useId();
  const [nText, setNText] = useState(String(HARNESS_DEFAULTS.n));
  const [seedText, setSeedText] = useState(String(HARNESS_DEFAULTS.seed));
  const [conds, setConds] = useState<Record<Condition, boolean>>({ retrieved: true, gold: true });
  const [run, setRun] = useState<HarnessRun | null>(null);
  const [imported, setImported] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);
  const n = clampN(Number(nText));
  const seed = Number.isInteger(Number(seedText)) ? Number(seedText) : HARNESS_DEFAULTS.seed;
  const sample = useMemo(() => sampleClaims(claims, n, seed), [claims, n, seed]);
  const chosen = CONDITION_ORDER.filter((c) => conds[c]);
  const busy = status === "loading" || status === "running";

  const shownIds = run ? run.claimIds : sample.map((c) => c.id);
  const shownConds = run ? run.conditions : chosen;
  const done = run ? Object.values(run.outcomes).reduce((a, o) => a + Object.keys(o).length, 0) : 0;
  const total = run ? run.claimIds.length * run.conditions.length : 0;

  const model = activeModel(settings);
  const estimate = useMemo(() => {
    const chars = sample.reduce((a, c) => a + chosen.reduce((b, k) => b + c.promptChars[k], 0), 0);
    const calls = sample.length * chosen.length;
    const inTok = Math.ceil(chars / 4); // about four characters per token
    const outTok = calls * (OUTPUT_TOKENS[model] ?? 300);
    return {
      calls,
      inTok,
      outTok,
      usd: estimateCostUsd(settings.provider, model, inTok, outTok),
    };
  }, [sample, chosen, model, settings.provider]);

  const summaries = useMemo(() => {
    if (!run || busy) return null;
    return Object.fromEntries(
      run.conditions.map((c) => [
        c,
        summarizeCondition(c, rowsFor(run, c, byId), HARNESS_BOOTSTRAP),
      ]),
    ) as Partial<Record<Condition, ConditionSummary | null>>;
  }, [run, busy, byId]);

  async function start() {
    if (!hasKey) {
      openSettings();
      return;
    }
    if (chosen.length === 0) {
      setNotice("Choose at least one evidence condition.");
      return;
    }
    setNotice(null);
    setStatus("loading");
    setImported(false);
    const store = getAuditStore();
    let dataset: Map<string, HarnessClaim>;
    try {
      await store.list();
    } catch {
      setStatus("failed");
      setNotice(
        "This browser cannot keep the AI audit log (IndexedDB is unavailable, for example in some private modes), so the harness will not call a model.",
      );
      return;
    }
    try {
      dataset = await loadDataset();
    } catch {
      setStatus("failed");
      setNotice("Could not load the dev-set evidence from this site. Check your connection.");
      return;
    }
    const snapshot: AiSettings = settings;
    const startedAt = new Date().toISOString();
    const ids = sample.map((c) => c.id);
    const fresh: HarnessRun = {
      format: "climate-claim-checker/llm-eval",
      version: 1,
      startedAt,
      finishedAt: null,
      provider: snapshot.provider,
      model: activeModel(snapshot),
      n: ids.length,
      seed,
      conditions: chosen,
      claimIds: ids,
      outcomes: {},
    };
    setRun(fresh);
    setStatus("running");
    const ctrl = new AbortController();
    controller.current = ctrl;
    const tasks = ids.flatMap((cid) => chosen.map((cond) => ({ cid, cond })));
    let next = 0;
    let fatal: string | null = null;

    const worker = async () => {
      while (!ctrl.signal.aborted) {
        const t = tasks[next++];
        if (!t) return;
        const claim = dataset.get(t.cid);
        if (!claim) continue;
        try {
          const res = await runFactCheck({
            settings: snapshot,
            claim: claim.text,
            passages: t.cond === "retrieved" ? claim.retrieved : claim.gold,
            feature: "llm-eval",
            meta: {
              claim_id: t.cid,
              condition: t.cond,
              run_started_at: startedAt,
              sample_seed: seed,
              sample_size: ids.length,
            },
            store,
            signal: ctrl.signal,
          });
          const outcome = toOutcome(res);
          setRun((r) =>
            r && r.startedAt === startedAt
              ? {
                  ...r,
                  outcomes: { ...r.outcomes, [t.cid]: { ...r.outcomes[t.cid], [t.cond]: outcome } },
                }
              : r,
          );
          if (res.status === "error" && FATAL.has(res.kind)) {
            fatal = res.message;
            ctrl.abort();
          }
        } catch {
          return; // aborted
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    controller.current = null;
    setRun((r) =>
      r && r.startedAt === startedAt ? { ...r, finishedAt: new Date().toISOString() } : r,
    );
    if (fatal) {
      setNotice(`Stopped: ${fatal}`);
      setStatus("failed");
    } else {
      setStatus(ctrl.signal.aborted ? "stopped" : "done");
    }
  }

  function stop() {
    controller.current?.abort();
  }

  function exportJson() {
    if (!run) return;
    const summary = summaries ?? {};
    const payload = {
      ...run,
      note: "LLM outputs in this file are AI-generated. Classifier verdicts are the retrained 2024 model's stored predictions.",
      bootstrap: HARNESS_BOOTSTRAP,
      summary: Object.fromEntries(
        Object.entries(summary).map(([c, s]) => [
          c,
          s && {
            scored: s.scored,
            excluded: s.excluded,
            invalid_outputs: s.invalidOutputs,
            llm_accuracy: s.llm.accuracy,
            classifier_accuracy: s.classifier.accuracy,
            llm_macro_f1: s.llm.macroF1,
            classifier_macro_f1: s.classifier.macroF1,
            accuracy_difference: s.comparison.difference,
            mcnemar: s.comparison.mcnemar,
            cohens_h: s.comparison.cohensH,
            citations_all_valid: s.citations.allValid,
            evidence_f: s.evidence,
            harmonic_mean: s.harmonicMean,
            latency_ms: s.latencyMs,
            tokens: s.tokens,
          },
        ]),
      ),
    };
    downloadText(
      `llm-eval-${fileSafe(run.model)}-${fileStamp()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }

  function exportCsv() {
    if (!run) return;
    downloadText(
      `llm-eval-${fileSafe(run.model)}-${fileStamp()}.csv`,
      toCsv(runToRows(run, byId), RUN_CSV_COLUMNS),
      "text/csv",
    );
  }

  async function importRun(file: File) {
    try {
      const parsed = parseRun(JSON.parse(await file.text()));
      const unknown = parsed.claimIds.filter((c) => !byId.has(c));
      if (unknown.length > 0)
        throw new Error(`unknown claim ids: ${unknown.slice(0, 3).join(", ")}`);
      setRun(parsed);
      setImported(true);
      setStatus("done");
      setNotice(null);
    } catch (err) {
      setNotice(
        `That file is not a run exported from this page (${err instanceof Error ? err.message.slice(0, 160) : "unreadable"}).`,
      );
    }
  }

  const model0 = modelOption(settings.provider, model);

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------ controls */}
      <section
        aria-labelledby={`${id}-setup`}
        className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-setup`} className="font-serif text-2xl font-medium">
              Run the comparison
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              A seeded random sample of dev claims. Each one is sent to the model once per evidence
              condition, straight from your browser.
            </p>
          </div>
          <KeyStatus settings={settings} hasKey={hasKey} onOpen={openSettings} />
        </div>

        <div className="grid gap-4 sm:grid-cols-[8rem_8rem_1fr]">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-n`} className="text-sm font-medium">
              Claims (N)
            </label>
            <input
              id={`${id}-n`}
              type="number"
              inputMode="numeric"
              min={1}
              max={154}
              value={nText}
              disabled={busy}
              onChange={(e) => setNText(e.target.value)}
              onBlur={() => setNText(String(n))}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm tabular outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-seed`} className="text-sm font-medium">
              Sample seed
            </label>
            <input
              id={`${id}-seed`}
              type="number"
              inputMode="numeric"
              value={seedText}
              disabled={busy}
              onChange={(e) => setSeedText(e.target.value)}
              onBlur={() => setSeedText(String(seed))}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm tabular outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Evidence the LLM sees</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1.5">
              {CONDITION_ORDER.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={conds[c]}
                    disabled={busy}
                    onChange={(e) => setConds((s) => ({ ...s, [c]: e.target.checked }))}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {CONDITIONS[c].short}
                  {c === "gold" && (
                    <span className="text-xs text-muted-foreground">(upper bound)</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Cost note.</span> {estimate.calls} calls,
          about {int(Math.round(estimate.inTok / 100) * 100)} input and{" "}
          {int(Math.round(estimate.outTok / 100) * 100)} output tokens
          {estimate.usd !== null ? (
            <>
              , roughly{" "}
              <span className="font-mono text-foreground">
                US${estimate.usd < 0.01 ? "0.01" : estimate.usd.toFixed(2)}
              </span>{" "}
              with {model0.label}
            </>
          ) : (
            <>, priced by your OpenAI plan for {model}</>
          )}
          . An estimate only: your provider bills your key directly, and this site never sees the
          bill or the key.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {status === "running" ? (
            <Button size="lg" variant="outline" onClick={stop}>
              <Square aria-hidden /> Stop
            </Button>
          ) : (
            <Button size="lg" onClick={start} disabled={busy || chosen.length === 0}>
              {status === "loading" ? (
                <LoaderCircle aria-hidden className="animate-spin" />
              ) : hasKey ? (
                <Play aria-hidden />
              ) : (
                <KeyRound aria-hidden />
              )}
              {hasKey ? `Run ${estimate.calls} calls` : "Add your key to run"}
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importRun(f);
              e.target.value = "";
            }}
          />
          <Button
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp aria-hidden /> Load a saved run
          </Button>
          {run && !busy && (
            <>
              <Button size="lg" variant="outline" onClick={exportJson}>
                <Download aria-hidden /> JSON
              </Button>
              <Button size="lg" variant="outline" onClick={exportCsv}>
                <Download aria-hidden /> CSV
              </Button>
            </>
          )}
        </div>

        {notice && (
          <p
            role="alert"
            className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2 text-sm"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            {notice}
          </p>
        )}

        {run && (
          <div aria-live="polite" className="space-y-1.5">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {imported ? "Loaded from file: " : ""}
                {PROVIDERS[run.provider as "anthropic" | "openai"]?.label ?? run.provider} ·{" "}
                <span className="font-mono">{run.model}</span> · N = {run.n}, seed {run.seed}
              </span>
              <span className="tabular">
                {status === "running"
                  ? `${done} of ${total} calls`
                  : status === "stopped"
                    ? `Stopped after ${done} of ${total} calls`
                    : status === "failed"
                      ? `${done} of ${total} calls before stopping`
                      : `${done} of ${total} calls`}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Calls completed"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <div
                className="h-full rounded-full bg-series-1 transition-[width] duration-300"
                style={{ width: `${total ? (100 * done) / total : 0}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------- results */}
      {summaries && run && (
        <section aria-labelledby={`${id}-results`} className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id={`${id}-results`} className="font-serif text-2xl font-medium">
              Results
            </h2>
            <AiGeneratedBadge model={run.model} />
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            LLM verdicts are AI-generated; classifier verdicts are the retrained 2024 model&rsquo;s
            stored predictions on the same claims. {Math.round(HARNESS_BOOTSTRAP.level * 100)}%
            intervals: Wilson for proportions, otherwise a paired percentile bootstrap over claims (
            {int(HARNESS_BOOTSTRAP.resamples)} resamples, seed {HARNESS_BOOTSTRAP.seed}).
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            {run.conditions.map((c) => {
              const s = summaries[c];
              return s ? (
                <ConditionCard key={c} s={s} provider={run.provider} model={run.model} />
              ) : (
                <div key={c} className="rounded-2xl border border-dashed border-border p-6 text-sm">
                  <p className="font-medium">{CONDITIONS[c].title}</p>
                  <p className="mt-1 text-muted-foreground">
                    No scored calls for this condition yet.
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- claim table */}
      <section aria-labelledby={`${id}-claims`} className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`${id}-claims`} className="font-serif text-2xl font-medium">
            {run ? "Claim by claim" : `The sample: ${sample.length} claims`}
          </h2>
          <p className="text-xs text-muted-foreground">
            ✓ right · ✗ wrong · every LLM call is in the{" "}
            <Link href="/ai-log" className="text-foreground underline underline-offset-4">
              AI audit log
            </Link>
          </p>
        </div>
        <ClaimTable
          ids={shownIds}
          conditions={shownConds}
          byId={byId}
          run={run}
          running={status === "running"}
        />
      </section>
    </div>
  );
}

function KeyStatus({
  settings,
  hasKey,
  onOpen,
}: {
  settings: AiSettings;
  hasKey: boolean;
  onOpen: () => void;
}) {
  const model = modelOption(settings.provider, activeModel(settings));
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium">
          {PROVIDERS[settings.provider].label} · {model.label}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasKey ? `Key ${maskKey(settings.keys[settings.provider])}` : "No key yet"}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onOpen}>
        {hasKey ? "Change" : "Add key"}
      </Button>
    </div>
  );
}

function Pair({
  label,
  llm,
  clf,
  scale,
}: {
  label: string;
  llm: { estimate: number; lower: number; upper: number; text: string };
  clf: { estimate: number; lower: number; upper: number; text: string };
  scale: [number, number, string, string];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {[["LLM", llm, "series-1"] as const, ["Classifier", clf, "series-2"] as const].map(
        ([who, v, tone]) => (
          <div key={who} className="grid grid-cols-[8rem_1fr] items-center gap-3">
            <p className="text-sm">
              {who}
              <span className="block font-mono text-xs whitespace-nowrap text-muted-foreground tabular">
                {v.text}
              </span>
            </p>
            <IntervalBar
              estimate={v.estimate}
              lower={v.lower}
              upper={v.upper}
              min={scale[0]}
              max={scale[1]}
              tone={tone}
            />
          </div>
        ),
      )}
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <span />
        <ScaleLabels left={scale[2]} right={scale[3]} />
      </div>
    </div>
  );
}

function ConditionCard({
  s,
  provider,
  model,
}: {
  s: ConditionSummary;
  provider: string;
  model: string;
}) {
  const c = s.comparison;
  const cost =
    s.tokens && (provider === "anthropic" || provider === "openai")
      ? estimateCostUsd(provider, model, s.tokens.input, s.tokens.output)
      : null;
  const width = s.llm.accuracy.upper - s.llm.accuracy.lower;
  return (
    <article className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div>
        <h3 className="font-serif text-xl font-medium">{CONDITIONS[s.condition].title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{CONDITIONS[s.condition].description}</p>
        <p className="mt-2 text-xs text-muted-foreground tabular">
          {s.scored} {s.scored === 1 ? "claim" : "claims"} scored
          {s.excluded > 0 && ` · ${s.excluded} excluded (call failed)`}
          {s.invalidOutputs > 0 &&
            ` · ${s.invalidOutputs} unusable ${s.invalidOutputs === 1 ? "answer" : "answers"} counted as wrong`}
        </p>
      </div>

      <Pair
        label="Label accuracy (Wilson 95% CI)"
        llm={{
          ...s.llm.accuracy,
          text: `${pct(s.llm.accuracy.estimate, 0)} ${range(s.llm.accuracy.lower, s.llm.accuracy.upper, "pct", 0)}`,
        }}
        clf={{
          ...s.classifier.accuracy,
          text: `${pct(s.classifier.accuracy.estimate, 0)} ${range(s.classifier.accuracy.lower, s.classifier.accuracy.upper, "pct", 0)}`,
        }}
        scale={[0, 1, "0%", "100%"]}
      />
      <Pair
        label="Macro-F1 (bootstrap 95% CI)"
        llm={{
          ...s.llm.macroF1,
          text: `${fixed(s.llm.macroF1.estimate, 2)} ${range(s.llm.macroF1.lower, s.llm.macroF1.upper, "fixed", 2)}`,
        }}
        clf={{
          ...s.classifier.macroF1,
          text: `${fixed(s.classifier.macroF1.estimate, 2)} ${range(s.classifier.macroF1.lower, s.classifier.macroF1.upper, "fixed", 2)}`,
        }}
        scale={[0, 1, "0", "1"]}
      />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-4 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">LLM − classifier accuracy (paired)</dt>
          <dd className="font-mono tabular">
            {pp(c.difference.estimate)}{" "}
            <span className="text-muted-foreground">
              {range(c.difference.lower, c.difference.upper, "pp")}
            </span>
          </dd>
          <dd className="text-xs text-muted-foreground">
            McNemar exact {pText(c.mcnemar.exactP)} · {c.mcnemar.b} only the LLM got right,{" "}
            {c.mcnemar.c} only the classifier · Cohen&rsquo;s h {signed(c.cohensH, 2)} (
            {describeCohensH(c.cohensH)})
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Citations all valid</dt>
          <dd className="font-mono tabular">
            {s.citations.citing > 0
              ? `${s.citations.allValid.successes} of ${s.citations.citing}`
              : "no citations"}
          </dd>
          {s.citations.citing > 0 && (
            <dd className="text-xs text-muted-foreground tabular">
              {pct(s.citations.allValid.estimate, 0)}{" "}
              {range(s.citations.allValid.lower, s.citations.allValid.upper, "pct", 0)} ·{" "}
              {s.citations.idsInvalid} of {s.citations.idsCited} ids not shown to it
            </dd>
          )}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Evidence F vs gold</dt>
          <dd className="font-mono tabular">
            LLM {fixed(s.evidence.llm.estimate, 2)}{" "}
            <span className="text-muted-foreground">
              {range(s.evidence.llm.lower, s.evidence.llm.upper, "fixed", 2)}
            </span>
          </dd>
          <dd className="text-xs text-muted-foreground tabular">
            {s.condition === "retrieved"
              ? `2024 retrieval list ${fixed(s.evidence.classifier.estimate, 2)}`
              : "cited passages against the gold set"}
          </dd>
        </div>
        {s.harmonicMean && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">
              Course metric: harmonic mean of evidence F and accuracy
            </dt>
            <dd className="font-mono tabular">
              LLM {fixed(s.harmonicMean.llm.estimate)}{" "}
              <span className="text-muted-foreground">
                {range(s.harmonicMean.llm.lower, s.harmonicMean.llm.upper, "fixed")}
              </span>{" "}
              · 2024 system {fixed(s.harmonicMean.classifier.estimate)}{" "}
              <span className="text-muted-foreground">
                {range(s.harmonicMean.classifier.lower, s.harmonicMean.classifier.upper, "fixed")}
              </span>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">Latency per call</dt>
          <dd className="font-mono tabular">
            {s.latencyMs
              ? `median ${(s.latencyMs.median / 1000).toFixed(1)} s · p90 ${(s.latencyMs.p90 / 1000).toFixed(1)} s`
              : "–"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tokens (as reported)</dt>
          <dd className="font-mono tabular">
            {s.tokens ? `${int(s.tokens.input)} in · ${int(s.tokens.output)} out` : "–"}
          </dd>
          {cost !== null && (
            <dd className="text-xs text-muted-foreground tabular">
              ≈ US${cost < 0.01 ? "<0.01" : cost.toFixed(2)} at list price
            </dd>
          )}
        </div>
      </dl>
      <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        With {s.scored} claims the LLM&rsquo;s accuracy interval is {Math.round(width * 100)} points
        wide, so only large differences can be told apart from sampling noise. Raise N for a sharper
        answer.
      </p>
    </article>
  );
}

function LlmCell({ o, running }: { o: LlmOutcome | undefined; running: boolean }) {
  if (!o) {
    return running ? (
      <LoaderCircle aria-label="waiting" className="size-4 animate-spin text-muted-foreground" />
    ) : (
      <span className="text-muted-foreground">–</span>
    );
  }
  if (o.status === "error") {
    return (
      <span className="text-xs text-muted-foreground">
        call failed ({o.kind.replace(/_/g, " ")}), excluded
      </span>
    );
  }
  if (o.status === "invalid_output") {
    return (
      <span className="text-xs text-destructive">
        no usable answer ({o.kind.replace(/_/g, " ")})
      </span>
    );
  }
  return (
    <div className="space-y-1">
      <VerdictBadge label={o.label} size="sm" />
      <p className="text-[0.7rem] text-muted-foreground tabular">
        {o.cited.length === 0
          ? "no citations"
          : `${o.valid.length} cited${o.invalid.length ? ` · ${o.invalid.length} invalid` : ""}`}
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          rationale
        </summary>
        <p className="mt-1 max-w-[16rem] leading-relaxed">{o.rationale}</p>
      </details>
    </div>
  );
}

function Mark({ right }: { right: boolean | null }) {
  if (right === null) return null;
  return right ? (
    <Check aria-label="right" className="size-3.5 text-hit" />
  ) : (
    <X aria-label="wrong" className="size-3.5 text-refutes" />
  );
}

function ClaimTable({
  ids,
  conditions,
  byId,
  run,
  running,
}: {
  ids: string[];
  conditions: Condition[];
  byId: ReadonlyMap<string, HarnessClaimSummary>;
  run: HarnessRun | null;
  running: boolean;
}) {
  return (
    <div
      className="overflow-x-auto rounded-xl border border-border bg-card"
      role="region"
      aria-label="Claims in the sample"
      tabIndex={0}
    >
      <table className="w-full min-w-[46rem] text-left text-sm">
        <caption className="sr-only">
          Each sampled claim with its gold label, the classifier verdict and the LLM verdict for
          each evidence condition
        </caption>
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Claim
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Gold
            </th>
            {conditions.map((c) => (
              <th key={c} scope="col" colSpan={2} className="px-3 py-3 font-medium">
                {CONDITIONS[c].short}
                <span className="block font-normal">classifier · LLM</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {ids.map((cid) => {
            const c = byId.get(cid);
            if (!c) return null;
            return (
              <tr key={cid} className="align-top">
                <th scope="row" className="max-w-[22rem] px-4 py-3 font-normal">
                  <Link
                    href={`/explore/${cid}`}
                    className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
                    prefetch={false}
                  >
                    claim {claimNumber(cid)}
                  </Link>
                  <span className="mt-0.5 line-clamp-3 block leading-snug">{c.text}</span>
                </th>
                <td className="px-3 py-3">
                  <VerdictBadge label={c.label} size="sm" />
                </td>
                {conditions.map((cond) => {
                  const o = run?.outcomes[cid]?.[cond];
                  const llmRight =
                    !o || o.status === "error" ? null : o.status === "ok" && o.label === c.label;
                  return [
                    <td key={`${cond}-c`} className="px-3 py-3">
                      <span className="flex items-center gap-1.5">
                        <VerdictBadge label={c.classifier[cond]} size="sm" />
                        <Mark right={c.classifier[cond] === c.label} />
                      </span>
                    </td>,
                    <td key={`${cond}-l`} className={cn("px-3 py-3", o && "bg-accent/25")}>
                      <span className="flex items-start gap-1.5">
                        <LlmCell o={o} running={running} />
                        <Mark right={llmRight} />
                      </span>
                    </td>,
                  ];
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
