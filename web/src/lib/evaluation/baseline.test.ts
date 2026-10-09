/**
 * The dev-set baseline report against the same numbers recomputed in Python
 * (numpy, scikit-learn, statsmodels) by `scripts/stats_reference.py`.
 */
import { describe, expect, it } from "vitest";

import ref from "@/lib/__fixtures__/stats-reference.json";
import { LABELS } from "@/lib/labels";
import type { BootstrapInterval, ProportionInterval } from "@/lib/stats";
import { baselineRows } from "@/server/evaluation";
import { BASELINE_BOOTSTRAP, baselineReport } from "./baseline";

const b = ref.baseline;
const report = baselineReport(baselineRows());

function sameBoot(
  actual: BootstrapInterval,
  expected: { estimate: number; lower: number; upper: number },
) {
  expect(actual.estimate).toBeCloseTo(expected.estimate, 12);
  expect(actual.lower).toBeCloseTo(expected.lower, 12);
  expect(actual.upper).toBeCloseTo(expected.upper, 12);
}

function sameWilson(
  actual: ProportionInterval,
  expected: { k: number; n: number; lower: number; upper: number },
) {
  expect(actual.successes).toBe(expected.k);
  expect(actual.n).toBe(expected.n);
  expect(actual.lower).toBeCloseTo(expected.lower, 12);
  expect(actual.upper).toBeCloseTo(expected.upper, 12);
}

describe("baselineReport (dev set, 154 claims)", () => {
  it("uses the documented resampling settings", () => {
    expect(report.n).toBe(b.n);
    expect(report.options).toEqual(BASELINE_BOOTSTRAP);
    expect(b.resamples).toBe(BASELINE_BOOTSTRAP.resamples);
    expect(b.seed).toBe(BASELINE_BOOTSTRAP.seed);
  });

  it("keeps the original point estimates unchanged", () => {
    expect(report.protocols.batch.accuracy.estimate).toBeCloseTo(59 / 154, 15);
    expect(report.retrieval.f.estimate).toBeCloseTo(0.04299207286220274, 15);
    expect(report.harmonicMean.estimate).toBeCloseTo(0.07730881373218297, 15);
  });

  it("matches Python for every protocol", () => {
    for (const p of ["batch", "single", "gold_evidence"] as const) {
      const e = report.protocols[p];
      const x = b.protocols[p];
      sameWilson(e.accuracy, x.accuracy);
      sameBoot(e.accuracyBootstrap, x.accuracy_bootstrap);
      sameBoot(e.macroF1, x.macro_f1);
      expect(e.labels).toEqual(x.labels);
      e.perClass.forEach((m, i) => {
        expect(m.precision).toBeCloseTo(x.per_class.precision[i], 12);
        expect(m.recall).toBeCloseTo(x.per_class.recall[i], 12);
        expect(m.f1).toBeCloseTo(x.per_class.f1[i], 12);
        expect(m.support).toBe(x.per_class.support[i]);
      });
    }
    sameWilson(report.majority.accuracy, b.majority.accuracy);
    sameBoot(report.majority.macroF1, b.majority.macro_f1);
  });

  it("matches Python for the paired comparisons", () => {
    for (const [mine, theirs] of [
      [report.classifierVsMajority, b.classifier_vs_majority],
      [report.goldVsRetrieved, b.gold_vs_retrieved],
    ] as const) {
      sameBoot(mine.difference, theirs.difference);
      sameBoot(mine.macroF1Difference, theirs.macro_f1_difference);
      expect(mine.mcnemar.b).toBe(theirs.b);
      expect(mine.mcnemar.c).toBe(theirs.c);
      expect(mine.mcnemar.exactP).toBeCloseTo(theirs.exact_p, 12);
      expect(mine.cohensH).toBeCloseTo(theirs.cohens_h, 12);
    }
  });

  it("matches Python for retrieval, the harmonic mean and the per-label breakdown", () => {
    sameBoot(report.retrieval.precision, b.retrieval.precision);
    sameBoot(report.retrieval.recall, b.retrieval.recall);
    sameBoot(report.retrieval.f, b.retrieval.f);
    sameWilson(report.retrieval.anyGoldFound, b.retrieval.any_gold_found);
    sameBoot(report.harmonicMean, b.harmonic_mean);
    expect(report.byLabel.map((x) => x.label)).toEqual([...LABELS]);
    report.byLabel.forEach((row, i) => {
      const x = b.by_label[i];
      expect(row.n).toBe(x.n);
      expect(row.predictedAs).toEqual(x.predicted_as);
      sameWilson(row.recall, x.recall);
      sameBoot(row.meanEvidenceF, x.mean_evidence_f);
      sameWilson(row.anyGoldFound, x.any_gold_found);
    });
  });
});
