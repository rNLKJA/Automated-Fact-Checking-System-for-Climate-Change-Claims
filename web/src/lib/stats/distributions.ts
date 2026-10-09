/**
 * The handful of distribution functions the evaluation needs, written out so the
 * site has no numerical dependency: the log-gamma function, the regularised
 * upper incomplete gamma function (for chi-square tail probabilities), the
 * standard normal CDF and its inverse, and the binomial CDF.
 *
 * Every function is checked against scipy in `stats.test.ts` (reference values from
 * `scripts/stats_reference.py`).
 */

const LANCZOS_G = 7;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0 (Lanczos approximation, ~15 significant digits). */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // reflection: Γ(x) Γ(1 - x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }
  const z = x - 1;
  let s = LANCZOS[0];
  for (let i = 1; i < LANCZOS_G + 2; i++) s += LANCZOS[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(s);
}

const EPS = 1e-15;
const TINY = 1e-300;

/** Regularised lower incomplete gamma P(a, x) by its power series (x < a + 1). */
function gammaPSeries(a: number, x: number): number {
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 0; n < 10_000; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** Regularised upper incomplete gamma Q(a, x) by Lentz's continued fraction (x >= a + 1). */
function gammaQFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10_000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Q(a, x) = Γ(a, x) / Γ(a), the regularised upper incomplete gamma function. */
export function regularizedGammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gammaPSeries(a, x) : gammaQFraction(a, x);
}

/** Upper tail of the chi-square distribution, P(X >= x) with `df` degrees of freedom. */
export function chiSquareSf(x: number, df: number): number {
  return regularizedGammaQ(df / 2, x / 2);
}

/** Standard normal CDF Φ(z), via erfc(t) = Q(1/2, t²). */
export function normalCdf(z: number): number {
  const tail = 0.5 * regularizedGammaQ(0.5, (z * z) / 2);
  return z >= 0 ? 1 - tail : tail;
}

/**
 * Inverse of the standard normal CDF (Wichura's AS241, PPND16), accurate to
 * about 1e-16 over (0, 1).
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (
      (q *
        (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r +
          45921.953931549871457) *
          r +
          13731.693765509461125) *
          r +
          1971.5909503065514427) *
          r +
          133.14166789178437745) *
          r +
          3.387132872796366608)) /
      (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r +
        21213.794301586595867) *
        r +
        5394.1960214247511077) *
        r +
        687.1870074920579083) *
        r +
        42.313330701600911252) *
        r +
        1)
    );
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let x: number;
  if (r <= 5) {
    r -= 1.6;
    x =
      (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r +
        0.24178072517745061177) *
        r +
        1.27045825245236838258) *
        r +
        3.64784832476320460504) *
        r +
        5.7694972214606914055) *
        r +
        4.6303378461565452959) *
        r +
        1.42343711074968357734) /
      (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r +
        0.0151986665636164571966) *
        r +
        0.14810397642748007459) *
        r +
        0.68976733498510000455) *
        r +
        1.6763848301838038494) *
        r +
        2.05319162663775882187) *
        r +
        1);
  } else {
    r -= 5;
    x =
      (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r +
        0.0012426609473880784386) *
        r +
        0.026532189526576123093) *
        r +
        0.29656057182850489123) *
        r +
        1.7848265399172913358) *
        r +
        5.4637849111641143699) *
        r +
        6.6579046435011037772) /
      (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r +
        1.8463183175100546818e-5) *
        r +
        7.868691311456132591e-4) *
        r +
        0.0148753612908506148525) *
        r +
        0.13692988092273580531) *
        r +
        0.59983220655588793769) *
        r +
        1);
  }
  return q < 0 ? -x : x;
}

/** P(X <= k) for X ~ Binomial(n, p), summed in log space. */
export function binomialCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  const lnN = logGamma(n + 1);
  const lp = Math.log(p);
  const lq = Math.log1p(-p);
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += Math.exp(lnN - logGamma(i + 1) - logGamma(n - i + 1) + i * lp + (n - i) * lq);
  }
  return Math.min(1, sum);
}
