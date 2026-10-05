/**
 * The team's from-scratch Transformer classifier (notebook cells 35-37), as it
 * behaves on a single claim.
 *
 * `CustomTokenizer.encode`: `[CLS] + text.split() + [SEP]`, unknown words ->
 * `<unk>`, truncated to 128 ids (last kept id replaced by [SEP]) and padded
 * with [PAD].
 *
 * The notebook builds `nn.TransformerEncoder` without `batch_first=True` but
 * feeds it `(batch, seq, dim)` tensors, so self-attention runs across the
 * claims of a mini-batch instead of across words. With one claim per batch the
 * attention covers a single element, each of the 128 positions is transformed
 * independently, and the mean-pool + linear head reduce the network to
 *
 *     logits = bias + (1/128) * sum_t g[id_t]
 *
 * for a per-token table g (|V| x 4) that `scripts/train_classifier.py` exports
 * from the retrained weights (checked against PyTorch to < 1e-4).
 */
import { LABELS, type Label } from "./labels";
import { pySplit } from "./text/pystr";

export type TokenTable = {
  labels: Label[];
  maxLen: number;
  tokens: string[];
  bias: number[];
  /** g[id] = 4 logit contributions */
  g: number[][];
};

export type Classifier = TokenTable & { vocab: Map<string, number> };

export function createClassifier(table: TokenTable): Classifier {
  const vocab = new Map<string, number>();
  table.tokens.forEach((t, i) => vocab.set(t, i));
  for (const special of ["<unk>", "[CLS]", "[SEP]", "[PAD]"]) {
    if (!vocab.has(special)) throw new Error(`token table is missing ${special}`);
  }
  return { ...table, vocab };
}

/** `CustomTokenizer.encode(text, max_length, padding="max_length", truncation=True)` */
export function encode(clf: Classifier, text: string, maxLength = clf.maxLen): number[] {
  const unk = clf.vocab.get("<unk>") as number;
  const sep = clf.vocab.get("[SEP]") as number;
  const pad = clf.vocab.get("[PAD]") as number;
  const tokens = ["[CLS]", ...pySplit(text), "[SEP]"];
  let ids = tokens.map((t) => clf.vocab.get(t) ?? unk);
  if (ids.length > maxLength) ids = [...ids.slice(0, maxLength - 1), sep];
  while (ids.length < maxLength) ids.push(pad);
  return ids;
}

export type Prediction = {
  label: Label;
  logits: number[];
  probs: number[];
  ids: number[];
  unknownTokens: number;
};

export function softmax(xs: number[]): number[] {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/** Classify the model input string (`claim_text + " " + evidence_text`, both already preprocessed). */
export function classify(clf: Classifier, modelInput: string): Prediction {
  const ids = encode(clf, modelInput);
  const logits = [...clf.bias];
  const sums = [0, 0, 0, 0];
  for (const id of ids) {
    const row = clf.g[id];
    for (let k = 0; k < sums.length; k++) sums[k] += row[k];
  }
  for (let k = 0; k < logits.length; k++) logits[k] += sums[k] / ids.length;
  const probs = softmax(logits);
  let best = 0;
  for (let k = 1; k < logits.length; k++) if (logits[k] > logits[best]) best = k;
  const unk = clf.vocab.get("<unk>");
  return {
    label: clf.labels[best] ?? LABELS[best],
    logits,
    probs,
    ids,
    unknownTokens: ids.filter((i) => i === unk).length,
  };
}

/** Build the model input exactly like `combine_claims_evidence_test` (cell 51). */
export function buildModelInput(claimStems: string[], evidenceStems: string[][]): string {
  const claimText = claimStems.join(" ");
  const evidenceText = evidenceStems.map((e) => e.join(" ")).join(" ");
  return claimText + " " + evidenceText;
}

export type TokenContribution = {
  token: string;
  /** how many of the 128 positions hold this token */
  count: number;
  /** summed contribution to each class logit: count * g[id] / maxLen */
  logits: number[];
  /** the same, centred across classes (softmax ignores a shift shared by all classes) */
  centred: number[];
};

/**
 * Exact additive attribution of the logits to the input tokens. Because the
 * network is `bias + mean_t g[id_t]` for a single claim, every position adds
 * `g[id] / maxLen` to the logits; positions holding the same token are merged.
 * The contributions plus the bias sum to the logits exactly.
 */
export function tokenContributions(clf: Classifier, ids: readonly number[]): TokenContribution[] {
  const byId = new Map<number, number>();
  for (const id of ids) byId.set(id, (byId.get(id) ?? 0) + 1);
  const out: TokenContribution[] = [];
  for (const [id, count] of byId) {
    const logits = clf.g[id].map((x) => (count * x) / ids.length);
    const mean = logits.reduce((a, b) => a + b, 0) / logits.length;
    out.push({ token: clf.tokens[id], count, logits, centred: logits.map((x) => x - mean) });
  }
  return out;
}
