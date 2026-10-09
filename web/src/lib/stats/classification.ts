/**
 * Classification metrics with scikit-learn's conventions (checked against
 * sklearn in `stats.test.ts`): per-class precision, recall and F1 with
 * `zero_division=0`, and macro-F1 averaged over the labels that appear in either
 * the gold or the predicted labels (sklearn's default label set).
 */

export type ClassMetrics = {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  /** number of gold items with this label */
  support: number;
  /** number of items predicted as this label */
  predicted: number;
};

export function accuracy(gold: readonly string[], pred: readonly string[]): number {
  if (gold.length === 0) return NaN;
  let k = 0;
  for (let i = 0; i < gold.length; i++) if (gold[i] === pred[i]) k++;
  return k / gold.length;
}

/** Labels present in gold or predictions, sorted like `numpy.unique`. */
export function presentLabels(gold: readonly string[], pred: readonly string[]): string[] {
  return [...new Set([...gold, ...pred])].sort();
}

/** matrix[i][j] = items with gold label labels[i] predicted as labels[j]. */
export function confusionMatrix(
  gold: readonly string[],
  pred: readonly string[],
  labels: readonly string[],
): number[][] {
  const at = new Map(labels.map((l, i) => [l, i]));
  const m = labels.map(() => labels.map(() => 0));
  for (let i = 0; i < gold.length; i++) {
    const g = at.get(gold[i]);
    const p = at.get(pred[i]);
    if (g !== undefined && p !== undefined) m[g][p]++;
  }
  return m;
}

export function perClassMetrics(
  gold: readonly string[],
  pred: readonly string[],
  labels: readonly string[] = presentLabels(gold, pred),
): ClassMetrics[] {
  return labels.map((label) => {
    let tp = 0;
    let support = 0;
    let predicted = 0;
    for (let i = 0; i < gold.length; i++) {
      const g = gold[i] === label;
      const p = pred[i] === label;
      if (g) support++;
      if (p) predicted++;
      if (g && p) tp++;
    }
    const precision = predicted === 0 ? 0 : tp / predicted;
    const recall = support === 0 ? 0 : tp / support;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { label, precision, recall, f1, support, predicted };
  });
}

/** Unweighted mean F1 over `labels` (default: labels present in gold or predictions). */
export function macroF1(
  gold: readonly string[],
  pred: readonly string[],
  labels: readonly string[] = presentLabels(gold, pred),
): number {
  if (labels.length === 0) return NaN;
  const per = perClassMetrics(gold, pred, labels);
  return per.reduce((a, m) => a + m.f1, 0) / per.length;
}

/** Pick the entries of `xs` at `indices` (helper for bootstrapping label vectors). */
export function at<T>(xs: readonly T[], indices: readonly number[]): T[] {
  return indices.map((i) => xs[i]);
}
