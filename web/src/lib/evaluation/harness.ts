/**
 * The LLM-vs-classifier evaluation harness: which claims, which evidence, and
 * how the results are scored. The model calls themselves happen in the browser
 * with the visitor's key (`components/evaluation/harness.tsx`); everything
 * here is pure so it can be unit-tested.
 *
 * Scoring rules (stated on /evaluation and /methods):
 * - Both systems are scored on the same claims, so comparisons are paired.
 * - A call that failed for infrastructure reasons (bad key, network, rate limit)
 *   is excluded and counted; neither system is scored on that claim.
 * - An answer the model did give but that is unusable (invalid JSON, refusal,
 *   cut off) is scored as wrong ("no answer"), not excluded.
 */
import { z } from "zod";

import { LABELS, type Label } from "../labels";
import { evidenceScore, harmonicMean } from "../metrics";
import {
  bootstrap,
  comparePaired,
  evaluateLabels,
  meanAt,
  quantile,
  sampleWithoutReplacement,
  wilsonInterval,
  type BootstrapInterval,
  type BootstrapOptions,
  type LabelEvaluation,
  type PairedComparison,
  type ProportionInterval,
} from "../stats";

export type Passage = { id: string; text: string };

export type Condition = "retrieved" | "gold";

export const CONDITIONS: Record<Condition, { title: string; short: string; description: string }> =
  {
    retrieved: {
      title: "Same retrieved evidence",
      short: "Retrieved evidence",
      description:
        "The passages the 2024 TF-IDF retrieval returned for the claim (the team's saved list). The classifier was scored on exactly these.",
    },
    gold: {
      title: "Gold evidence (upper bound)",
      short: "Gold evidence",
      description:
        "The annotators' evidence passages, as if retrieval were perfect. Both systems are compared on this too.",
    },
  };

export const CONDITION_ORDER: readonly Condition[] = ["retrieved", "gold"];

/** Placeholder verdict for an unusable answer: always wrong, kept out of macro-F1's label set. */
export const NO_ANSWER = "NO_ANSWER";

export const HARNESS_DEFAULTS = { n: 20, seed: 42 } as const;
export const HARNESS_BOOTSTRAP = { resamples: 5_000, seed: 2026, level: 0.95 } as const;

export type HarnessClaimSummary = {
  id: string;
  ord: number;
  text: string;
  label: Label;
  /** the retrained classifier's stored verdicts: notebook protocol on retrieved, and on gold evidence */
  classifier: Record<Condition, Label>;
  retrievedIds: string[];
  goldIds: string[];
  /** length of the full prompt (system + user) per condition, for cost estimates */
  promptChars: Record<Condition, number>;
};

export type HarnessClaim = Omit<HarnessClaimSummary, "retrievedIds" | "goldIds" | "promptChars"> & {
  retrieved: Passage[];
  gold: Passage[];
};

export type LlmOutcome =
  | {
      status: "ok";
      label: Label;
      cited: string[];
      valid: string[];
      invalid: string[];
      rationale: string;
      latencyMs: number;
      inputTokens: number | null;
      outputTokens: number | null;
      auditId: string;
    }
  | {
      status: "invalid_output";
      kind: string;
      message: string;
      latencyMs: number | null;
      inputTokens: number | null;
      outputTokens: number | null;
      auditId: string;
    }
  | { status: "error"; kind: string; message: string; auditId: string };

/** The `n` claims for a run: a seeded simple random sample, shown in dev-set order. */
export function sampleClaims<T extends { id: string; ord: number }>(
  claims: readonly T[],
  n: number,
  seed: number,
): T[] {
  return sampleWithoutReplacement(claims, n, seed).sort((a, b) => a.ord - b.ord);
}

export type HarnessRow = {
  claimId: string;
  gold: Label;
  classifier: Label;
  outcome: LlmOutcome;
  /** the passage ids the LLM was shown, and the gold ids (for evidence scoring) */
  providedIds: string[];
  goldIds: string[];
  /** the 2024 retrieval list for this claim (for the classifier's evidence F) */
  retrievedIds: string[];
};

export type ConditionSummary = {
  condition: Condition;
  attempted: number;
  /** claims scored for both systems */
  scored: number;
  /** infrastructure failures, excluded */
  excluded: number;
  /** unusable answers, scored as wrong */
  invalidOutputs: number;
  llm: LabelEvaluation;
  classifier: LabelEvaluation;
  /** A = LLM, B = classifier */
  comparison: PairedComparison;
  citations: {
    /** usable answers */
    answers: number;
    /** answers citing at least one id */
    citing: number;
    /** share of citing answers whose every cited id was among the passages shown */
    allValid: ProportionInterval;
    idsCited: number;
    idsInvalid: number;
  };
  /** evidence F (course metric) of the passages each system relied on, against gold */
  evidence: {
    llm: BootstrapInterval;
    /** the classifier relies on every passage it was shown */
    classifier: BootstrapInterval;
  };
  /** the course's harmonic mean of evidence F and accuracy (retrieved condition only) */
  harmonicMean: { llm: BootstrapInterval; classifier: BootstrapInterval } | null;
  latencyMs: { median: number; p90: number; mean: number } | null;
  tokens: { input: number; output: number; calls: number } | null;
};

export function summarizeCondition(
  condition: Condition,
  rows: readonly HarnessRow[],
  options: BootstrapOptions = HARNESS_BOOTSTRAP,
): ConditionSummary | null {
  const attempted = rows.length;
  const scoredRows = rows.filter((r) => r.outcome.status !== "error");
  if (scoredRows.length === 0) return null;
  const gold = scoredRows.map((r) => r.gold);
  const llmPred = scoredRows.map((r) => (r.outcome.status === "ok" ? r.outcome.label : NO_ANSWER));
  const clfPred = scoredRows.map((r) => r.classifier);
  const opts = { ...options, labelSpace: LABELS };

  const answers = scoredRows.flatMap((r) => (r.outcome.status === "ok" ? [r.outcome] : []));
  const citing = answers.filter((o) => o.cited.length > 0);
  const allValid = citing.filter((o) => o.invalid.length === 0).length;

  const llmF = scoredRows.map((r) =>
    r.outcome.status === "ok" ? evidenceScore(r.outcome.valid, r.goldIds).f : 0,
  );
  const clfF = scoredRows.map((r) => evidenceScore(r.providedIds, r.goldIds).f);
  const llmOk = scoredRows.map((r, i) => (llmPred[i] === r.gold ? 1 : 0));
  const clfOk = scoredRows.map((r) => (r.classifier === r.gold ? 1 : 0));
  const n = scoredRows.length;

  const latencies = scoredRows.flatMap((r) =>
    r.outcome.status !== "error" && r.outcome.latencyMs !== null ? [r.outcome.latencyMs] : [],
  );
  const withTokens = scoredRows.flatMap((r) =>
    r.outcome.status !== "error" && r.outcome.inputTokens !== null ? [r.outcome] : [],
  );

  return {
    condition,
    attempted,
    scored: n,
    excluded: attempted - n,
    invalidOutputs: scoredRows.filter((r) => r.outcome.status === "invalid_output").length,
    llm: evaluateLabels(gold, llmPred, opts),
    classifier: evaluateLabels(gold, clfPred, opts),
    comparison: comparePaired(gold, llmPred, clfPred, opts),
    citations: {
      answers: answers.length,
      citing: citing.length,
      allValid: wilsonInterval(allValid, citing.length, options.level),
      idsCited: answers.reduce((a, o) => a + o.valid.length + o.invalid.length, 0),
      idsInvalid: answers.reduce((a, o) => a + o.invalid.length, 0),
    },
    evidence: {
      llm: bootstrap(n, (idx) => meanAt(llmF, idx), options),
      classifier: bootstrap(n, (idx) => meanAt(clfF, idx), options),
    },
    harmonicMean:
      condition === "retrieved"
        ? {
            llm: bootstrap(
              n,
              (idx) => harmonicMean(meanAt(llmF, idx), meanAt(llmOk, idx)),
              options,
            ),
            classifier: bootstrap(
              n,
              (idx) => harmonicMean(meanAt(clfF, idx), meanAt(clfOk, idx)),
              options,
            ),
          }
        : null,
    latencyMs:
      latencies.length > 0
        ? {
            median: quantile(latencies, 0.5),
            p90: quantile(latencies, 0.9),
            mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          }
        : null,
    tokens:
      withTokens.length > 0
        ? {
            input: withTokens.reduce((a, o) => a + (o.inputTokens ?? 0), 0),
            output: withTokens.reduce((a, o) => a + (o.outputTokens ?? 0), 0),
            calls: withTokens.length,
          }
        : null,
  };
}

/** A complete, exportable run (also the format "Load a saved run" accepts). */
export type HarnessRun = {
  format: "climate-claim-checker/llm-eval";
  version: 1;
  startedAt: string;
  finishedAt: string | null;
  provider: string;
  model: string;
  n: number;
  seed: number;
  conditions: Condition[];
  claimIds: string[];
  outcomes: Record<string, Partial<Record<Condition, LlmOutcome>>>;
};

/** Rows for one condition, in sample order, for the claims that have an outcome. */
export function rowsFor(
  run: Pick<HarnessRun, "claimIds" | "outcomes">,
  condition: Condition,
  claims: ReadonlyMap<string, HarnessClaimSummary>,
): HarnessRow[] {
  return run.claimIds.flatMap((id) => {
    const c = claims.get(id);
    const outcome = run.outcomes[id]?.[condition];
    if (!c || !outcome) return [];
    return [
      {
        claimId: id,
        gold: c.label,
        classifier: c.classifier[condition],
        outcome,
        providedIds: condition === "retrieved" ? c.retrievedIds : c.goldIds,
        goldIds: c.goldIds,
        retrievedIds: c.retrievedIds,
      },
    ];
  });
}

/** Flat rows for the CSV export of a run. */
export function runToRows(
  run: HarnessRun,
  claims: ReadonlyMap<string, HarnessClaimSummary>,
): Record<string, unknown>[] {
  return run.conditions.flatMap((condition) =>
    rowsFor(run, condition, claims).map((r) => {
      const o = r.outcome;
      return {
        claim_id: r.claimId,
        condition,
        gold_label: r.gold,
        classifier_label: r.classifier,
        llm_status: o.status,
        llm_label: o.status === "ok" ? o.label : null,
        llm_correct: o.status === "error" ? null : o.status === "ok" && o.label === r.gold,
        classifier_correct: r.classifier === r.gold,
        cited_ids: o.status === "ok" ? o.cited.join(" ") : null,
        invalid_ids: o.status === "ok" ? o.invalid.join(" ") : null,
        rationale: o.status === "ok" ? o.rationale : null,
        error: o.status === "ok" ? null : `${o.kind}: ${o.message}`,
        latency_ms: o.status === "error" || o.latencyMs === null ? null : Math.round(o.latencyMs),
        input_tokens: o.status === "error" ? null : o.inputTokens,
        output_tokens: o.status === "error" ? null : o.outputTokens,
        provider: run.provider,
        model: run.model,
        seed: run.seed,
        audit_id: o.auditId,
      };
    }),
  );
}

export const RUN_CSV_COLUMNS = [
  "claim_id",
  "condition",
  "gold_label",
  "classifier_label",
  "llm_status",
  "llm_label",
  "llm_correct",
  "classifier_correct",
  "cited_ids",
  "invalid_ids",
  "rationale",
  "error",
  "latency_ms",
  "input_tokens",
  "output_tokens",
  "provider",
  "model",
  "seed",
  "audit_id",
] as const;

const nullableNumber = z.number().nullable();

const OutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    label: z.enum(LABELS),
    cited: z.array(z.string()),
    valid: z.array(z.string()),
    invalid: z.array(z.string()),
    rationale: z.string(),
    latencyMs: z.number(),
    inputTokens: nullableNumber,
    outputTokens: nullableNumber,
    auditId: z.string(),
  }),
  z.object({
    status: z.literal("invalid_output"),
    kind: z.string(),
    message: z.string(),
    latencyMs: nullableNumber,
    inputTokens: nullableNumber,
    outputTokens: nullableNumber,
    auditId: z.string(),
  }),
  z.object({
    status: z.literal("error"),
    kind: z.string(),
    message: z.string(),
    auditId: z.string(),
  }),
]);

const ConditionSchema = z.enum(["retrieved", "gold"]);

export const HarnessRunSchema = z.object({
  format: z.literal("climate-claim-checker/llm-eval"),
  version: z.literal(1),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  n: z.number().int().nonnegative(),
  seed: z.number().int(),
  conditions: z.array(ConditionSchema),
  claimIds: z.array(z.string()),
  outcomes: z.record(
    z.string(),
    z.object({ retrieved: OutcomeSchema.optional(), gold: OutcomeSchema.optional() }),
  ),
});

/** Validate a run loaded from a file (the JSON export of this page). */
export function parseRun(json: unknown): HarnessRun {
  return HarnessRunSchema.parse(json) as HarnessRun;
}
