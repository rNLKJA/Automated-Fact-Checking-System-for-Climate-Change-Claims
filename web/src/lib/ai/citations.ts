/**
 * Checking an LLM's cited evidence ids against the passages it was shown.
 * Pure, so the evaluation harness can re-derive it from a saved run.
 */

export type CitationCheck = {
  /** distinct cited ids that were among the provided passages */
  valid: string[];
  /** distinct cited ids that were not */
  invalid: string[];
};

export function checkCitations(
  cited: readonly string[],
  provided: readonly string[],
): CitationCheck {
  const allowed = new Set(provided);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of cited) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    (allowed.has(id) ? valid : invalid).push(id);
  }
  return { valid, invalid };
}
