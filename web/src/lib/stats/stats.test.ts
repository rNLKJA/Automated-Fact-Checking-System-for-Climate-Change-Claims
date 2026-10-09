/**
 * The statistics helpers against the Python scientific stack
 * (fixture written by `uv run scripts/stats_reference.py`).
 */
import { describe, expect, it } from "vitest";

import ref from "@/lib/__fixtures__/stats-reference.json";
import { bootstrap, bootstrapMean, quantile } from "./bootstrap";
import { accuracy, at, confusionMatrix, macroF1, perClassMetrics } from "./classification";
import {
  binomialCdf,
  chiSquareSf,
  logGamma,
  normalCdf,
  normalQuantile,
  regularizedGammaQ,
} from "./distributions";
import { mcnemar, mcnemarFromCounts } from "./mcnemar";
import { cohensH, describeCohensH, wilsonInterval } from "./proportion";
import { mulberry32, sampleWithoutReplacement } from "./random";
import { comparePaired, evaluateLabels } from "./summary";

const u = ref.units;

/** relative-or-absolute closeness for values spanning many magnitudes */
function close(actual: number, expected: number, rel = 1e-12, abs = 1e-14) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(abs, rel * Math.abs(expected)));
}

describe("mulberry32", () => {
  it("matches the Python port bit for bit", () => {
    for (const [seed, expected] of Object.entries(u.mulberry32)) {
      const rng = mulberry32(Number(seed));
      expect(expected.map(() => rng())).toEqual(expected);
    }
  });

  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("samples without replacement like the Python port", () => {
    const s = sampleWithoutReplacement(u.sample.items, u.sample.k, u.sample.seed);
    expect(s).toEqual(u.sample.expected);
    expect(new Set(s).size).toBe(s.length);
    expect(sampleWithoutReplacement([1, 2, 3], 10, 1)).toHaveLength(3);
    expect(sampleWithoutReplacement([1, 2, 3], -1, 1)).toEqual([]);
  });
});

describe("quantile (numpy linear method)", () => {
  it("agrees with numpy.quantile exactly", () => {
    for (const c of u.quantile) {
      c.p.forEach((p, i) => expect(quantile(c.x, p)).toBe(c.expected[i]));
    }
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe("distributions (scipy)", () => {
  it("log-gamma", () => {
    for (const [x, y] of u.gammaln) close(logGamma(x), y, 1e-13);
  });
  it("normal quantile (AS241)", () => {
    for (const [p, z] of u.normal_ppf) close(normalQuantile(p), z, 1e-13);
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
    expect(normalQuantile(2)).toBeNaN();
  });
  it("normal CDF", () => {
    for (const [z, p] of u.normal_cdf) close(normalCdf(z), p, 1e-12, 1e-15);
  });
  it("chi-square survival function", () => {
    for (const [x, df, p] of u.chi2_sf) close(chiSquareSf(x, df), p, 1e-12);
    expect(regularizedGammaQ(1, 0)).toBe(1);
  });
  it("binomial CDF", () => {
    for (const [k, n, p, c] of u.binom_cdf) close(binomialCdf(k, n, p), c, 1e-11);
    expect(binomialCdf(-1, 5, 0.5)).toBe(0);
    expect(binomialCdf(5, 5, 0.5)).toBe(1);
  });
});

describe("Wilson interval (statsmodels)", () => {
  it("matches proportion_confint(method='wilson')", () => {
    for (const c of u.wilson) {
      const w = wilsonInterval(c.k, c.n, c.level);
      expect(w.estimate).toBe(c.estimate);
      close(w.lower, c.lower, 1e-12, 1e-15);
      close(w.upper, c.upper, 1e-12, 1e-15);
      expect(w.lower).toBeGreaterThanOrEqual(0);
      expect(w.upper).toBeLessThanOrEqual(1);
    }
    const w90 = wilsonInterval(u.wilson_90.k, u.wilson_90.n, u.wilson_90.level);
    close(w90.lower, u.wilson_90.lower);
    close(w90.upper, u.wilson_90.upper);
    expect(wilsonInterval(0, 0).estimate).toBeNaN();
  });
});

describe("McNemar (statsmodels)", () => {
  it("exact and continuity-corrected p-values", () => {
    for (const c of u.mcnemar) {
      const r = mcnemarFromCounts(c.b, c.c, 7, 9);
      close(r.exactP, c.exact_p, 1e-11);
      close(r.chi2, c.chi2, 1e-12);
      close(r.chi2P, c.chi2_p, 1e-10);
      expect(r.n).toBe(c.b + c.c + 16);
    }
  });

  it("counts discordant pairs from per-item correctness", () => {
    const a = [true, true, false, false, true];
    const b = [true, false, true, false, false];
    const r = mcnemar(a, b);
    expect([r.b, r.c, r.bothRight, r.bothWrong]).toEqual([2, 1, 1, 1]);
    expect(() => mcnemar([true], [])).toThrow();
  });
});

describe("Cohen's h (statsmodels)", () => {
  it("matches proportion_effectsize", () => {
    for (const [p1, p2, h] of u.cohens_h) close(cohensH(p1, p2), h, 1e-13);
    expect(describeCohensH(0.1)).toBe("negligible");
    expect(describeCohensH(-0.3)).toBe("small");
    expect(describeCohensH(0.6)).toBe("medium");
    expect(describeCohensH(1.2)).toBe("large");
  });
});

describe("classification metrics (scikit-learn)", () => {
  it("per-class precision, recall, F1, support and macro-F1", () => {
    for (const c of u.classification) {
      expect(accuracy(c.gold, c.pred)).toBeCloseTo(c.accuracy, 15);
      const per = perClassMetrics(c.gold, c.pred);
      expect(per.map((m) => m.label)).toEqual(c.labels);
      per.forEach((m, i) => {
        close(m.precision, c.precision[i]);
        close(m.recall, c.recall[i]);
        close(m.f1, c.f1[i]);
        expect(m.support).toBe(c.support[i]);
      });
      close(macroF1(c.gold, c.pred), c.macro_f1);
    }
  });

  it("builds a confusion matrix over a fixed label order", () => {
    const m = confusionMatrix(["a", "a", "b", "c"], ["a", "b", "b", "x"], ["a", "b", "c"]);
    expect(m).toEqual([
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
    expect(at(["x", "y", "z"], [2, 2, 0])).toEqual(["z", "z", "x"]);
    expect(accuracy([], [])).toBeNaN();
    expect(macroF1([], [])).toBeNaN();
  });
});

describe("percentile bootstrap", () => {
  it("reproduces numpy on the same resampling stream", () => {
    const b = u.bootstrap_mean;
    const r = bootstrapMean(b.x, { resamples: b.resamples, seed: b.seed });
    close(r.estimate, b.estimate);
    close(r.lower, b.lower);
    close(r.upper, b.upper);
    close(r.se, b.se, 1e-9);
    expect(r.method).toBe("percentile bootstrap");
    expect([r.resamples, r.seed, r.level]).toEqual([b.resamples, b.seed, 0.95]);
  });

  it("lands near scipy.stats.bootstrap (independent random stream)", () => {
    const b = u.bootstrap_mean;
    const r = bootstrapMean(b.x, { resamples: 20_000, seed: 1 });
    expect(Math.abs(r.lower - b.scipy_percentile[0])).toBeLessThan(0.05);
    expect(Math.abs(r.upper - b.scipy_percentile[1])).toBeLessThan(0.05);
  });

  it("bootstraps macro-F1 like sklearn on each resample", () => {
    const b = u.bootstrap_macro_f1;
    const r = bootstrap(b.gold.length, (idx) => macroF1(at(b.gold, idx), at(b.pred, idx)), {
      resamples: b.resamples,
      seed: b.seed,
    });
    close(r.estimate, b.estimate);
    close(r.lower, b.lower);
    close(r.upper, b.upper);
  });

  it("is reproducible from its seed and handles empty samples", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(bootstrapMean(x, { seed: 3, resamples: 200 })).toEqual(
      bootstrapMean(x, { seed: 3, resamples: 200 }),
    );
    expect(bootstrapMean(x, { seed: 4, resamples: 200 }).lower).not.toBe(
      bootstrapMean(x, { seed: 3, resamples: 200 }).lower,
    );
    const empty = bootstrapMean([], { resamples: 10 });
    expect(empty.lower).toBeNaN();
  });
});

describe("summary bundles", () => {
  it("evaluateLabels pairs a Wilson interval with bootstrap intervals", () => {
    const gold = ["A", "A", "B", "B", "B", "C"];
    const pred = ["A", "B", "B", "B", "A", "C"];
    const e = evaluateLabels(gold, pred, { resamples: 500, seed: 1 });
    expect(e.correct).toBe(4);
    expect(e.accuracy.estimate).toBeCloseTo(4 / 6, 15);
    expect(e.accuracyBootstrap.estimate).toBeCloseTo(4 / 6, 15);
    expect(e.macroF1.lower).toBeLessThanOrEqual(e.macroF1.estimate);
    expect(e.macroF1.upper).toBeGreaterThanOrEqual(e.macroF1.estimate);
    expect(e.labels).toEqual(["A", "B", "C"]);
    expect(e.matrix.flat().reduce((a, b) => a + b, 0)).toBe(6);
    expect(() => evaluateLabels(["A"], [])).toThrow();
  });

  it("comparePaired resamples both systems together", () => {
    const gold = ["A", "B", "A", "B", "A", "B", "A", "B"];
    const same = comparePaired(gold, gold, gold, { resamples: 300 });
    expect(same.difference.estimate).toBe(0);
    expect(same.difference.lower).toBe(0);
    expect(same.difference.upper).toBe(0);
    expect(same.mcnemar.exactP).toBe(1);
    const allA = gold.map(() => "A");
    const c = comparePaired(gold, gold, allA, { resamples: 300 });
    expect(c.difference.estimate).toBeCloseTo(0.5, 15);
    expect(c.mcnemar.b).toBe(4);
    expect(c.mcnemar.c).toBe(0);
    expect(() => comparePaired(gold, gold, ["A"])).toThrow();
  });

  it("averages two systems' macro-F1 over one shared label set (sklearn)", () => {
    const s = u.macro_f1_shared;
    // alone, B is averaged over its own labels only (sklearn's default)
    close(
      evaluateLabels(s.gold, s.pred_b, { resamples: 10 }).macroF1.estimate,
      s.macro_f1_b_own_labels,
    );
    const a = evaluateLabels(s.gold, s.pred_a, { resamples: 10, sharedWith: s.pred_b });
    const b = evaluateLabels(s.gold, s.pred_b, { resamples: 10, sharedWith: s.pred_a });
    expect(a.labels).toEqual(s.labels);
    expect(b.labels).toEqual(s.labels);
    close(a.macroF1.estimate, s.macro_f1_a);
    close(b.macroF1.estimate, s.macro_f1_b);
    const c = comparePaired(s.gold, s.pred_a, s.pred_b, { resamples: s.resamples, seed: s.seed });
    close(c.macroF1Difference.estimate, s.estimate);
    close(c.macroF1Difference.lower, s.lower);
    close(c.macroF1Difference.upper, s.upper);
    expect(() => evaluateLabels(s.gold, s.pred_a, { sharedWith: ["A"] })).toThrow();
  });
});
