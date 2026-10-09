/**
 * The 2024 pipeline's dev-set results with their uncertainty.
 *
 * Nothing here changes the original numbers: the point estimates are exactly
 * the reported/re-run values, and the intervals describe how much they could
 * move on another sample of 154 claims like these. The resampling unit is the
 * claim, so retrieval and classification are resampled together.
 *
 * `scripts/stats_reference.py` recomputes this report with numpy, scikit-learn
 * and statsmodels; `baseline.test.ts` checks the two agree.
 */
import { LABELS, type Label } from "../labels";
import { evidenceScore, harmonicMean } from "../metrics";
import {
  bootstrap,
  bootstrapMean,
  comparePaired,
  evaluateLabels,
  meanAt,
  wilsonInterval,
  type BootstrapInterval,
  type BootstrapOptions,
  type LabelEvaluation,
  type PairedComparison,
  type ProportionInterval,
} from "../stats";
import type { Protocol } from "../types";

/** One dev claim as the baseline evaluation sees it. */
export type BaselineRow = {
  id: string;
  label: Label;
  predictions: Record<Protocol, Label>;
  /** the team's saved 2024 retrieval list */
  retrieved: string[];
  gold: string[];
};

export const BASELINE_BOOTSTRAP = { resamples: 10_000, seed: 2026, level: 0.95 } as const;

export type LabelBreakdown = {
  label: Label;
  n: number;
  /** predictions of the notebook-protocol classifier for claims with this gold label */
  predictedAs: Record<Label, number>;
  /** share of these claims labelled correctly (per-class recall) */
  recall: ProportionInterval;
  meanEvidenceF: BootstrapInterval;
  /** claims whose retrieved list holds at least one gold passage */
  anyGoldFound: ProportionInterval;
};

export type BaselineReport = {
  n: number;
  options: Required<BootstrapOptions>;
  protocols: Record<Protocol, LabelEvaluation>;
  majority: LabelEvaluation;
  /** A = notebook-protocol classifier, B = always "SUPPORTS" */
  classifierVsMajority: PairedComparison;
  /** A = classifier on gold evidence, B = the same classifier on retrieved evidence */
  goldVsRetrieved: PairedComparison;
  retrieval: {
    precision: BootstrapInterval;
    recall: BootstrapInterval;
    f: BootstrapInterval;
    anyGoldFound: ProportionInterval;
  };
  /** the course metric: harmonic mean of mean evidence F and label accuracy (notebook protocol) */
  harmonicMean: BootstrapInterval;
  byLabel: LabelBreakdown[];
};

export function baselineReport(
  rows: readonly BaselineRow[],
  options: BootstrapOptions = BASELINE_BOOTSTRAP,
): BaselineReport {
  const opts: Required<BootstrapOptions> = {
    resamples: options.resamples ?? BASELINE_BOOTSTRAP.resamples,
    seed: options.seed ?? BASELINE_BOOTSTRAP.seed,
    level: options.level ?? BASELINE_BOOTSTRAP.level,
  };
  const gold = rows.map((r) => r.label);
  const pred = (p: Protocol) => rows.map((r) => r.predictions[p]);
  const always = rows.map((): Label => "SUPPORTS");

  const scores = rows.map((r) => evidenceScore(r.retrieved, r.gold));
  const P = scores.map((s) => s.precision);
  const R = scores.map((s) => s.recall);
  const F = scores.map((s) => s.f);
  const hits = scores.filter((s) => s.correct > 0).length;
  const okBatch = rows.map((r) => (r.predictions.batch === r.label ? 1 : 0));

  const byLabel = LABELS.map((label): LabelBreakdown => {
    const idx = rows.flatMap((r, i) => (r.label === label ? [i] : []));
    const predictedAs = Object.fromEntries(LABELS.map((l) => [l, 0])) as Record<Label, number>;
    for (const i of idx) predictedAs[rows[i].predictions.batch]++;
    return {
      label,
      n: idx.length,
      predictedAs,
      recall: wilsonInterval(predictedAs[label], idx.length, opts.level),
      meanEvidenceF: bootstrapMean(
        idx.map((i) => F[i]),
        opts,
      ),
      anyGoldFound: wilsonInterval(
        idx.filter((i) => scores[i].correct > 0).length,
        idx.length,
        opts.level,
      ),
    };
  });

  return {
    n: rows.length,
    options: opts,
    protocols: {
      batch: evaluateLabels(gold, pred("batch"), opts),
      single: evaluateLabels(gold, pred("single"), opts),
      gold_evidence: evaluateLabels(gold, pred("gold_evidence"), opts),
    },
    majority: evaluateLabels(gold, always, opts),
    classifierVsMajority: comparePaired(gold, pred("batch"), always, opts),
    goldVsRetrieved: comparePaired(gold, pred("gold_evidence"), pred("batch"), opts),
    retrieval: {
      precision: bootstrapMean(P, opts),
      recall: bootstrapMean(R, opts),
      f: bootstrapMean(F, opts),
      anyGoldFound: wilsonInterval(hits, rows.length, opts.level),
    },
    harmonicMean: bootstrap(
      rows.length,
      (idx) => harmonicMean(meanAt(F, idx), meanAt(okBatch, idx)),
      opts,
    ),
    byLabel,
  };
}
