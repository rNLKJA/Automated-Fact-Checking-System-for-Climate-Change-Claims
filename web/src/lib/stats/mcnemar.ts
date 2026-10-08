/**
 * McNemar's test for two classifiers scored on the same items.
 *
 * Only the discordant pairs carry information: b = items system A gets right
 * and B gets wrong, c = the reverse. Under H0 (equal accuracy) b ~ Bin(b + c, 1/2).
 */
import { binomialCdf, chiSquareSf } from "./distributions";

export type McNemarResult = {
  /** A right, B wrong */
  b: number;
  /** A wrong, B right */
  c: number;
  /** both right */
  bothRight: number;
  /** both wrong */
  bothWrong: number;
  n: number;
  /** two-sided exact (binomial) p-value; = statsmodels mcnemar(exact=True) */
  exactP: number;
  /** continuity-corrected chi-square statistic; = statsmodels mcnemar(exact=False) */
  chi2: number;
  chi2P: number;
};

export function mcnemarFromCounts(
  b: number,
  c: number,
  bothRight = 0,
  bothWrong = 0,
): McNemarResult {
  const d = b + c;
  const exactP = d === 0 ? 1 : Math.min(1, 2 * binomialCdf(Math.min(b, c), d, 0.5));
  const chi2 = d === 0 ? 0 : (Math.abs(b - c) - 1) ** 2 / d;
  return {
    b,
    c,
    bothRight,
    bothWrong,
    n: b + c + bothRight + bothWrong,
    exactP,
    chi2,
    chi2P: d === 0 ? 1 : chiSquareSf(chi2, 1),
  };
}

/** McNemar's test from per-item correctness of system A and system B (same order). */
export function mcnemar(aCorrect: readonly boolean[], bCorrect: readonly boolean[]): McNemarResult {
  if (aCorrect.length !== bCorrect.length) {
    throw new Error("McNemar's test needs paired results of equal length.");
  }
  let b = 0;
  let c = 0;
  let both = 0;
  let neither = 0;
  for (let i = 0; i < aCorrect.length; i++) {
    if (aCorrect[i] && !bCorrect[i]) b++;
    else if (!aCorrect[i] && bCorrect[i]) c++;
    else if (aCorrect[i]) both++;
    else neither++;
  }
  return mcnemarFromCounts(b, c, both, neither);
}
