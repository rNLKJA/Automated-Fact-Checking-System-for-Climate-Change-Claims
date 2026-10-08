/** Small, locale-stable number formatters for the UI. */

export function fixed(x: number | null | undefined, digits = 3): string {
  return x === null || x === undefined || Number.isNaN(x) ? "–" : x.toFixed(digits);
}

export function pct(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(digits)}%`;
}

export function int(x: number): string {
  return x.toLocaleString("en-AU");
}

/** "claim-752" -> "752" */
export function claimNumber(id: string): string {
  return id.replace(/^claim-/, "");
}

/** "evidence-67732" -> "67732" */
export function evidenceNumber(id: string): string {
  return id.replace(/^evidence-/, "");
}

const MINUS = "−";

/** A signed difference of proportions in percentage points: "+5.8 pp", "−5.8 pp". */
export function pp(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  const v = (x * 100).toFixed(digits);
  if (Number(v) === 0) return `0${digits > 0 ? "." + "0".repeat(digits) : ""} pp`;
  return x > 0 ? `+${v} pp` : `${MINUS}${v.replace("-", "")} pp`;
}

/** A signed number with a true minus sign: "+0.062", "−0.118". */
export function signed(x: number | null | undefined, digits = 3): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  const v = Math.abs(x).toFixed(digits);
  if (Number(v) === 0) return v;
  return x > 0 ? `+${v}` : `${MINUS}${v}`;
}

/** p-values as usually reported: two significant figures, "< 0.001" below that. */
export function pValue(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "–";
  if (p < 0.001) return "< 0.001";
  if (p >= 0.995) return "1.00";
  return p < 0.01 ? p.toFixed(3) : p.toFixed(2);
}

/** "[31.0%, 46.2%]" or "[0.020, 0.069]" for an interval. */
export function range(
  lower: number,
  upper: number,
  kind: "pct" | "fixed" | "pp" | "signed" = "pct",
  digits = kind === "fixed" || kind === "signed" ? 3 : 1,
): string {
  const f = (x: number) =>
    kind === "pct"
      ? pct(x, digits)
      : kind === "pp"
        ? pp(x, digits)
        : kind === "signed"
          ? signed(x, digits)
          : fixed(x, digits);
  return `[${f(lower)}, ${f(upper)}]`;
}

/** "p = 0.22" or "p < 0.001". */
export function pText(p: number | null | undefined): string {
  const v = pValue(p);
  return v.startsWith("<") ? `p ${v}` : `p = ${v}`;
}
