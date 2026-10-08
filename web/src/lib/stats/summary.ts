/**
 * The reporting bundles used across the site: one classifier's accuracy and
 * macro-F1 with intervals, and a paired comparison of two classifiers on the
 * same items (difference with a paired bootstrap CI, McNemar's test, Cohen's h).
 */
import { bootstrap, type BootstrapInterval, type BootstrapOptions } from "./bootstrap";
import {
  accuracy,
  at,
  confusionMatrix,
  macroF1,
  perClassMetrics,
  presentLabels,
  type ClassMetrics,
} from "./classification";
import { mcnemar, type McNemarResult } from "./mcnemar";
import { cohensH, wilsonInterval, type ProportionInterval } from "./proportion";

export type LabelEvaluation = {
  n: number;
  correct: number;
  accuracy: ProportionInterval;
  accuracyBootstrap: BootstrapInterval;
  /** sklearn macro-F1 over the labels present in gold or predictions (re-derived per resample) */
  macroF1: BootstrapInterval;
  labels: string[];
  perClass: ClassMetrics[];
  /** [gold][predicted] over `labels` */
  matrix: number[][];
};

export type LabelOptions = BootstrapOptions & {
  /**
   * Restrict macro-F1 to these labels (still only those present in gold or
   * predictions). Used to keep a "no answer" placeholder out of the average:
   * it still counts as a miss for accuracy and recall.
   */
  labelSpace?: readonly string[];
};

/** sklearn's default label set (present in gold or predictions), optionally restricted. */
function labelsIn(gold: readonly string[], pred: readonly string[], space?: readonly string[]) {
  const present = presentLabels(gold, pred);
  return space ? present.filter((l) => space.includes(l)) : present;
}

function macroF1In(gold: readonly string[], pred: readonly string[], space?: readonly string[]) {
  return macroF1(gold, pred, labelsIn(gold, pred, space));
}

export function evaluateLabels(
  gold: readonly string[],
  pred: readonly string[],
  options: LabelOptions = {},
): LabelEvaluation {
  if (gold.length !== pred.length) throw new Error("gold and predictions differ in length");
  const space = options.labelSpace;
  const labels = labelsIn(gold, pred, space);
  const correct = gold.reduce((k, g, i) => k + (g === pred[i] ? 1 : 0), 0);
  return {
    n: gold.length,
    correct,
    accuracy: wilsonInterval(correct, gold.length, options.level),
    accuracyBootstrap: bootstrap(
      gold.length,
      (idx) => accuracy(at(gold, idx), at(pred, idx)),
      options,
    ),
    macroF1: bootstrap(
      gold.length,
      (idx) => macroF1In(at(gold, idx), at(pred, idx), space),
      options,
    ),
    labels,
    perClass: perClassMetrics(gold, pred, labels),
    matrix: confusionMatrix(gold, pred, labels),
  };
}

export type PairedComparison = {
  n: number;
  accuracyA: number;
  accuracyB: number;
  /** accuracy(A) − accuracy(B), paired bootstrap over items */
  difference: BootstrapInterval;
  /** macro-F1(A) − macro-F1(B), paired bootstrap over items */
  macroF1Difference: BootstrapInterval;
  mcnemar: McNemarResult;
  /** Cohen's h of accuracy A vs accuracy B (descriptive) */
  cohensH: number;
};

/** Compare system A with system B on the same items (same order as `gold`). */
export function comparePaired(
  gold: readonly string[],
  predA: readonly string[],
  predB: readonly string[],
  options: LabelOptions = {},
): PairedComparison {
  const space = options.labelSpace;
  const n = gold.length;
  if (predA.length !== n || predB.length !== n) throw new Error("paired inputs differ in length");
  const okA = gold.map((g, i) => g === predA[i]);
  const okB = gold.map((g, i) => g === predB[i]);
  const accA = accuracy(gold, predA);
  const accB = accuracy(gold, predB);
  return {
    n,
    accuracyA: accA,
    accuracyB: accB,
    difference: bootstrap(
      n,
      (idx) => {
        let d = 0;
        for (const i of idx) d += (okA[i] ? 1 : 0) - (okB[i] ? 1 : 0);
        return d / idx.length;
      },
      options,
    ),
    macroF1Difference: bootstrap(
      n,
      (idx) => {
        const g = at(gold, idx);
        return macroF1In(g, at(predA, idx), space) - macroF1In(g, at(predB, idx), space);
      },
      options,
    ),
    mcnemar: mcnemar(okA, okB),
    cohensH: cohensH(accA, accB),
  };
}
