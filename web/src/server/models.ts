import "server-only";

import { createClassifier, type Classifier } from "@/lib/classifier";
import { LABELS } from "@/lib/labels";
import { prepareIndex, type PreparedEvidence } from "@/lib/retrieval";
import { createTfidfModel, type SparseVector, type TfidfModel } from "@/lib/tfidf";
import { getDb, getMeta } from "./db";

/**
 * Model artefacts loaded once per server instance from the read-only database:
 * the two fitted TF-IDF vectorizers, the Transformer's token table and the
 * pruned evidence index.
 */

let tagModel: TfidfModel | undefined;
let keywordModel: TfidfModel | undefined;
let classifier: Classifier | undefined;
let index: PreparedEvidence[] | undefined;

function loadVectorizer(name: "tag" | "keyword", ngram: [number, number]): TfidfModel {
  const rows = getDb()
    .prepare("SELECT term, idf FROM vectorizer_terms WHERE vectorizer = ? ORDER BY idx")
    .all(name) as { term: string; idf: number }[];
  return createTfidfModel(
    name,
    rows.map((r) => r.term),
    rows.map((r) => r.idf),
    ngram,
  );
}

/** The 1,000-term tag vectorizer used for retrieval (notebook cell 20). */
export function getTagModel(): TfidfModel {
  tagModel ??= loadVectorizer("tag", [1, 1]);
  return tagModel;
}

/** The 20,000-feature keyword vectorizer that produced the evidence tags (cell 14 parameters). */
export function getKeywordModel(): TfidfModel {
  keywordModel ??= loadVectorizer("keyword", [1, 3]);
  return keywordModel;
}

/** The retrained Transformer, reduced exactly to its single-claim token table. */
export function getClassifier(): Classifier {
  if (!classifier) {
    const rows = getDb()
      .prepare("SELECT token, g0, g1, g2, g3 FROM token_table ORDER BY id")
      .all() as { token: string; g0: number; g1: number; g2: number; g3: number }[];
    const model = getMeta<{ bias: number[]; max_len: number }>("model");
    classifier = createClassifier({
      labels: [...LABELS],
      maxLen: model.max_len,
      tokens: rows.map((r) => r.token),
      bias: model.bias,
      g: rows.map((r) => [r.g0, r.g1, r.g2, r.g3]),
    });
  }
  return classifier;
}

/** Decode the packed `vec` column: uint16 indices followed by float64 weights (little endian). */
export function decodeVec(buf: Uint8Array): SparseVector {
  const n = buf.byteLength / 10;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const idx = new Array<number>(n);
  const w = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    idx[i] = view.getUint16(i * 2, true);
    w[i] = view.getFloat64(n * 2 + i * 8, true);
  }
  return { idx, w };
}

/** Every retrievable passage of the pruned index, in the team's corpus order. */
export function getEvidenceIndex(): PreparedEvidence[] {
  if (!index) {
    const rows = getDb()
      .prepare("SELECT evidence_id, tags, vec FROM evidence WHERE tags IS NOT NULL ORDER BY ord")
      .all() as { evidence_id: string; tags: string; vec: Uint8Array }[];
    index = prepareIndex(
      rows.map((r) => ({ evidenceId: r.evidence_id, tags: r.tags, vec: decodeVec(r.vec) })),
    );
  }
  return index;
}
