/**
 * Training-seed spread: the notebook's Transformer and LSTM retrained under
 * several seeds (`scripts/seed_spread.py`), to show how much of each number is
 * the luck of a single training run. The site's own model is the seed-42 run.
 */
import { LABELS, type Label } from "../labels";
import { accuracy, macroF1 } from "../stats";

export type SeedRunFile = {
  seed: number;
  best_epoch: number;
  best_val_acc: number;
  final_val_acc: number;
  val_acc: number[];
  predictions_retrieved: string[];
  predictions_gold: string[];
};

export type SeedSpreadFile = {
  seeds: number[];
  claim_ids: string[];
  torch: string;
  runs: Record<"transformer" | "lstm", SeedRunFile[]>;
};

export type ModelKind = "transformer" | "lstm";

export type SeedRun = {
  seed: number;
  bestEpoch: number;
  /** dev accuracy with gold evidence at the best epoch (what training selected on) */
  goldAccuracy: number;
  /** dev accuracy on the 2024 retrieved evidence, notebook protocol */
  retrievedAccuracy: number;
  retrievedMacroF1: number;
  /** labels the model ever predicted, on either evidence */
  labelsUsed: Label[];
};

export type Spread = { min: number; max: number; mean: number; sd: number };

export type SeedSpread = {
  seeds: number[];
  torch: string;
  models: Record<ModelKind, { runs: SeedRun[]; gold: Spread; retrieved: Spread }>;
  /** per seed: Transformer minus LSTM, gold-evidence accuracy */
  goldGap: { seed: number; gap: number }[];
};

export function spread(xs: readonly number[]): Spread {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { min: Math.min(...xs), max: Math.max(...xs), mean, sd };
}

export function summarizeSeedSpread(
  file: SeedSpreadFile,
  goldLabels: ReadonlyMap<string, string>,
): SeedSpread {
  const gold = file.claim_ids.map((id) => {
    const g = goldLabels.get(id);
    if (!g) throw new Error(`no gold label for ${id}`);
    return g;
  });
  const runsOf = (kind: ModelKind): SeedRun[] =>
    file.runs[kind].map((r) => {
      const used = new Set([...r.predictions_retrieved, ...r.predictions_gold]);
      return {
        seed: r.seed,
        bestEpoch: r.best_epoch,
        goldAccuracy: accuracy(gold, r.predictions_gold),
        retrievedAccuracy: accuracy(gold, r.predictions_retrieved),
        retrievedMacroF1: macroF1(gold, r.predictions_retrieved),
        labelsUsed: LABELS.filter((l) => used.has(l)),
      };
    });
  const models = Object.fromEntries(
    (["transformer", "lstm"] as const).map((kind) => {
      const runs = runsOf(kind);
      return [
        kind,
        {
          runs,
          gold: spread(runs.map((r) => r.goldAccuracy)),
          retrieved: spread(runs.map((r) => r.retrievedAccuracy)),
        },
      ];
    }),
  ) as SeedSpread["models"];
  return {
    seeds: file.seeds,
    torch: file.torch,
    models,
    goldGap: models.transformer.runs.map((t) => {
      const l = models.lstm.runs.find((x) => x.seed === t.seed);
      return { seed: t.seed, gap: l ? t.goldAccuracy - l.goldAccuracy : NaN };
    }),
  };
}
