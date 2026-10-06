/**
 * scikit-learn 1.2 `TfidfVectorizer.transform` for the two fitted vectorizers
 * the team pickled in 2024 (vocabulary + idf are exported verbatim):
 *
 *   analyzer = word n-grams over tokenizer(lowercase(doc))
 *   tf       = raw counts            (sublinear_tf=False)
 *   weight   = tf * idf              (use_idf=True, smooth_idf=True at fit time)
 *   norm     = l2
 *
 * The tokenizer is the notebook's `preprocess_and_tokenize`, injected so this
 * module stays framework-free and easy to test.
 */
import { npArgsort } from "./numpy";
import { pyIsAlpha } from "./text/pystr";

export type SparseVector = {
  /** feature indices, ascending */
  idx: number[];
  /** weights aligned with idx */
  w: number[];
};

export type TfidfModel = {
  name: string;
  /** terms in feature-index order (sklearn `get_feature_names_out()`) */
  terms: string[];
  idf: number[];
  ngramRange: [number, number];
  index: Map<string, number>;
};

export function createTfidfModel(
  name: string,
  terms: string[],
  idf: number[],
  ngramRange: [number, number],
): TfidfModel {
  if (terms.length !== idf.length) throw new Error(`${name}: terms/idf length mismatch`);
  const index = new Map<string, number>();
  terms.forEach((t, i) => index.set(t, i));
  return { name, terms, idf, ngramRange, index };
}

/** sklearn `_word_ngrams` (stop_words=None). */
export function wordNgrams(tokens: string[], [minN, maxN]: [number, number]): string[] {
  if (maxN === 1) return tokens;
  let out: string[];
  let n0 = minN;
  if (minN === 1) {
    out = [...tokens];
    n0 += 1;
  } else {
    out = [];
  }
  const total = tokens.length;
  for (let n = n0; n < Math.min(maxN + 1, total + 1); n++) {
    for (let i = 0; i < total - n + 1; i++) out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

export type Tokenizer = (text: string) => string[];

/** `vectorizer.transform([doc])[0]` as a sparse, l2-normalised vector. */
export function tfidfTransform(model: TfidfModel, doc: string, tokenizer: Tokenizer): SparseVector {
  const features = wordNgrams(tokenizer(doc.toLowerCase()), model.ngramRange);
  const counts = new Map<number, number>();
  for (const f of features) {
    const j = model.index.get(f);
    if (j !== undefined) counts.set(j, (counts.get(j) ?? 0) + 1);
  }
  const idx = [...counts.keys()].sort((a, b) => a - b);
  const w = idx.map((j) => (counts.get(j) as number) * model.idf[j]);
  return l2Normalize({ idx, w });
}

/** sklearn `normalize(X, norm="l2")` for one CSR row (sum of squares in stored order). */
export function l2Normalize(v: SparseVector): SparseVector {
  let ss = 0;
  for (const x of v.w) ss += x * x;
  if (ss === 0) return { idx: [...v.idx], w: [...v.w] };
  const norm = Math.sqrt(ss);
  return { idx: [...v.idx], w: v.w.map((x) => x / norm) };
}

/** Dot product of two index-sorted sparse vectors. */
export function sparseDot(a: SparseVector, b: SparseVector): number {
  let i = 0;
  let j = 0;
  let s = 0;
  while (i < a.idx.length && j < b.idx.length) {
    const ai = a.idx[i];
    const bj = b.idx[j];
    if (ai === bj) {
      s += a.w[i] * b.w[j];
      i++;
      j++;
    } else if (ai < bj) i++;
    else j++;
  }
  return s;
}

/** sklearn `cosine_similarity` for two rows (both re-normalised, as sklearn does). */
export function cosine(a: SparseVector, b: SparseVector): number {
  return sparseDot(l2Normalize(a), l2Normalize(b));
}

export type Keyword = { term: string; weight: number };

/**
 * `extract_most_relevant_keywords_for_a_claim` (cell 16): `np.argsort` over the
 * dense TF-IDF row, take the last `topN` indices, keep the purely alphabetic
 * feature names (so n-grams drop out). When fewer than `topN` features are
 * non-zero, numpy pads the selection with zero-weight features in its own
 * tie order; `npArgsort` reproduces that, so those zero-weight "keywords" are
 * returned too (with weight 0), exactly like the team's evidence tags.
 */
export function topKeywords(
  model: TfidfModel,
  text: string,
  tokenizer: Tokenizer,
  topN = 10,
): Keyword[] {
  const stems = tokenizer(text);
  const v = tfidfTransform(model, stems.join(" "), tokenizer);
  const dense = new Float64Array(model.terms.length);
  v.idx.forEach((j, k) => (dense[j] = v.w[k]));
  const order = npArgsort(dense);
  const top = Array.from(order.slice(Math.max(0, order.length - topN))).reverse();
  const seen = new Set<string>();
  const out: Keyword[] = [];
  for (const j of top) {
    const term = model.terms[j];
    if (!pyIsAlpha(term) || seen.has(term)) continue;
    seen.add(term);
    out.push({ term, weight: dense[j] });
  }
  return out;
}
