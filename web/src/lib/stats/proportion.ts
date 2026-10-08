/**
 * Intervals and effect sizes for proportions (accuracy, hit rates, validity rates).
 */
import type { Interval } from "./bootstrap";
import { normalQuantile } from "./distributions";

export type ProportionInterval = Interval & {
  method: "Wilson score";
  successes: number;
  n: number;
};

/**
 * Wilson score interval for k successes in n trials. Unlike the Wald interval it
 * stays inside [0, 1] and behaves well for small n and proportions near 0 or 1,
 * which is the situation for a 20-claim LLM run. Matches
 * `statsmodels.stats.proportion.proportion_confint(k, n, method="wilson")`.
 */
export function wilsonInterval(successes: number, n: number, level = 0.95): ProportionInterval {
  if (n === 0) {
    return { estimate: NaN, lower: NaN, upper: NaN, level, method: "Wilson score", successes, n };
  }
  const z = normalQuantile(1 - (1 - level) / 2);
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    estimate: p,
    lower: Math.max(0, centre - half),
    upper: Math.min(1, centre + half),
    level,
    method: "Wilson score",
    successes,
    n,
  };
}

/**
 * Cohen's h for two proportions: 2·asin(√p1) − 2·asin(√p2). Conventional
 * reading: 0.2 small, 0.5 medium, 0.8 large. Matches
 * `statsmodels.stats.proportion.proportion_effectsize(p1, p2)`.
 */
export function cohensH(p1: number, p2: number): number {
  return 2 * Math.asin(Math.sqrt(p1)) - 2 * Math.asin(Math.sqrt(p2));
}

export function describeCohensH(h: number): "negligible" | "small" | "medium" | "large" {
  const a = Math.abs(h);
  if (a < 0.2) return "negligible";
  if (a < 0.5) return "small";
  if (a < 0.8) return "medium";
  return "large";
}
