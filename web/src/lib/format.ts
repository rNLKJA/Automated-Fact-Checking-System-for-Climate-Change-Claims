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
