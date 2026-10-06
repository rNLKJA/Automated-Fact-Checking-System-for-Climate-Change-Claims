/**
 * The team's evidence-retrieval rule, `find_top_evidence` (notebook cell 24),
 * ported over an in-memory evidence index.
 *
 * For every passage:
 *   sim       = cosine(tfidf_tag(claim_tags), tfidf_tag(evidence_tags))
 *   overlap   = |claim_words ∩ evidence_words| / min(|claim_words|, |evidence_words|)
 *   max_match = |claim_words ∩ evidence_words|
 *   combined  = sim + overlap            (rule that produced the 2024 submission)
 *             = sim + overlap + sim      (rule in the committed notebook)
 *
 * Passages with sim > 0.55, overlap > 0.5 and combined > threshold are kept,
 * sorted by combined score, and only those sharing the largest max_match
 * survive (at most top-n). If nothing passes the filter, the top-n passages by
 * combined score are returned instead (the "fallback" path).
 */
import {
  l2Normalize,
  sparseDot,
  tfidfTransform,
  type SparseVector,
  type TfidfModel,
  type Tokenizer,
} from "./tfidf";
import { pySplit } from "./text/pystr";

export type IndexedEvidence = {
  evidenceId: string;
  /** space separated keyword stems (the team's `evidence_tags`) */
  tags: string;
  /** the passage's row of the team's `evidence_tfidf` matrix */
  vec: SparseVector;
};

export type PreparedEvidence = IndexedEvidence & {
  tagSet: ReadonlySet<string>;
  unit: SparseVector;
};

export type RetrievalRule = {
  id: RuleId;
  /** how often the cosine similarity is added into the combined score */
  simWeight: 1 | 2;
  sim: number;
  overlap: number;
  combined: number;
  topN: number;
};

export type RuleId = "submission" | "notebook";

export const RULES: Record<RuleId, RetrievalRule> = {
  /** Reconstructed from the team's saved 2024 outputs; reproduces the reported dev F = 0.04299. */
  submission: { id: "submission", simWeight: 1, sim: 0.55, overlap: 0.5, combined: 1.0, topN: 6 },
  /** `find_top_evidence` exactly as committed in the notebook (cell 24). */
  notebook: { id: "notebook", simWeight: 2, sim: 0.55, overlap: 0.5, combined: 1.5, topN: 6 },
};

export type ScoredEvidence = {
  evidenceId: string;
  sim: number;
  overlap: number;
  combined: number;
  maxMatch: number;
};

export type Selection = {
  path: "filtered" | "fallback";
  nFiltered: number;
  selected: ScoredEvidence[];
};

export type RetrievalResult = Selection & { claimTags: string; claimVec: SparseVector };

/** Python's default `sorted()` on str: compare by code point. */
export function pyStrCompare(a: string, b: string): number {
  const A = Array.from(a);
  const B = Array.from(b);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const d = (A[i].codePointAt(0) as number) - (B[i].codePointAt(0) as number);
    if (d !== 0) return d;
  }
  return A.length - B.length;
}

/** Claim "tags" as used for the reported runs: `" ".join(sorted(preprocess_and_tokenize(claim)))`. */
export function claimTagsOf(claim: string, tokenizer: Tokenizer): string {
  return [...tokenizer(claim)].sort(pyStrCompare).join(" ");
}

export function prepareIndex(rows: IndexedEvidence[]): PreparedEvidence[] {
  return rows.map((r) => ({ ...r, tagSet: new Set(pySplit(r.tags)), unit: l2Normalize(r.vec) }));
}

export class EmptyClaimError extends Error {
  constructor() {
    super("The claim has no content words left after stopword removal.");
    this.name = "EmptyClaimError";
  }
}

/** Score every passage of the index against a claim (`find_top_evidence`, first half). */
export function scoreEvidence(
  claimTags: string,
  claimVec: SparseVector,
  index: readonly PreparedEvidence[],
  simWeight: 1 | 2,
): ScoredEvidence[] {
  const claimWords = new Set(pySplit(claimTags));
  // The original divides by min(|claim|, |evidence|) and would raise ZeroDivisionError here.
  if (claimWords.size === 0) throw new EmptyClaimError();
  const claimUnit = l2Normalize(claimVec);
  const out: ScoredEvidence[] = new Array(index.length);
  for (let k = 0; k < index.length; k++) {
    const e = index[k];
    let inter = 0;
    for (const w of claimWords) if (e.tagSet.has(w)) inter++;
    const sim = sparseDot(claimUnit, e.unit);
    const overlap = inter / Math.min(claimWords.size, e.tagSet.size);
    const combined = simWeight === 2 ? sim + overlap + sim : sim + overlap;
    out[k] = { evidenceId: e.evidenceId, sim, overlap, combined, maxMatch: inter };
  }
  return out;
}

/** Stable sort by key descending (pandas `sort_values(ascending=False)`; ties keep input order). */
function sortDesc<T>(xs: readonly T[], key: (x: T) => number): T[] {
  return xs
    .map((x, i) => ({ x, i }))
    .sort((a, b) => key(b.x) - key(a.x) || a.i - b.i)
    .map((e) => e.x);
}

/** The filter / sort / max-match selection of `find_top_evidence` (second half). */
export function selectEvidence(scored: readonly ScoredEvidence[], rule: RetrievalRule): Selection {
  const filtered = scored.filter(
    (s) => s.sim > rule.sim && s.overlap > rule.overlap && s.combined > rule.combined,
  );
  if (filtered.length === 0) {
    return { path: "fallback", nFiltered: 0, selected: topByCombined(scored, rule.topN) };
  }
  // sort_values(by=["overlap_rate", "similaritie"], ascending=[False, False]) ...
  const pre = filtered
    .map((x, i) => ({ x, i }))
    .sort((a, b) => b.x.overlap - a.x.overlap || b.x.sim - a.x.sim || a.i - b.i)
    .map((e) => e.x);
  // ... then sort_values(by="combined_score", ascending=False)
  const ranked = sortDesc(pre, (s) => s.combined);
  let maxMatch = -Infinity;
  for (const s of ranked) maxMatch = Math.max(maxMatch, s.maxMatch);
  return {
    path: "filtered",
    nFiltered: filtered.length,
    selected: ranked.filter((s) => s.maxMatch === maxMatch).slice(0, rule.topN),
  };
}

/** Top-n by combined score without sorting the whole index (stable on ties). */
function topByCombined(scored: readonly ScoredEvidence[], n: number): ScoredEvidence[] {
  const best: { s: ScoredEvidence; i: number }[] = [];
  for (let i = 0; i < scored.length; i++) {
    const s = scored[i];
    if (best.length === n && s.combined <= best[best.length - 1].s.combined) continue;
    let j = best.length;
    while (j > 0 && best[j - 1].s.combined < s.combined) j--;
    best.splice(j, 0, { s, i });
    if (best.length > n) best.pop();
  }
  return best.map((b) => b.s);
}

/** End-to-end `find_top_evidence(claim_tags, ...)` over a prepared index. */
export function findTopEvidence(
  claimTags: string,
  tagModel: TfidfModel,
  tokenizer: Tokenizer,
  index: readonly PreparedEvidence[],
  rule: RetrievalRule = RULES.submission,
): RetrievalResult {
  const claimVec = tfidfTransform(tagModel, claimTags, tokenizer);
  const scored = scoreEvidence(claimTags, claimVec, index, rule.simWeight);
  return { claimTags, claimVec, ...selectEvidence(scored, rule) };
}
