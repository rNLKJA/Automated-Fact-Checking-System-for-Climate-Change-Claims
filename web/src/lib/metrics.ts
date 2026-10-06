/**
 * The course's official scoring (`coursework/scripts/eval.py`), ported.
 *
 * Per claim: evidence precision/recall/F against the gold evidence ids (0 when
 * nothing correct is retrieved) and label accuracy; the system score is the
 * harmonic mean of the mean F and the mean accuracy.
 */

export type EvidenceScore = { precision: number; recall: number; f: number; correct: number };

export function evidenceScore(retrieved: string[], gold: string[]): EvidenceScore {
  const none = { precision: 0, recall: 0, f: 0, correct: 0 };
  if (retrieved.length === 0) return none;
  const top = new Set(retrieved);
  let correct = 0;
  for (const g of gold) if (top.has(g)) correct++;
  if (correct === 0) return none;
  const recall = correct / gold.length;
  const precision = correct / retrieved.length;
  return { precision, recall, f: (2 * precision * recall) / (precision + recall), correct };
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function harmonicMean(f: number, a: number): number {
  if (f === 0 && a === 0) return 0;
  return (2 * f * a) / (f + a);
}

export type SystemScore = { f: number; accuracy: number; hm: number };

export function systemScore(
  rows: { retrieved: string[]; gold: string[]; predicted: string; label: string }[],
): SystemScore {
  const f = mean(rows.map((r) => evidenceScore(r.retrieved, r.gold).f));
  const accuracy = mean(rows.map((r) => (r.predicted === r.label ? 1 : 0)));
  return { f, accuracy, hm: harmonicMean(f, accuracy) };
}
