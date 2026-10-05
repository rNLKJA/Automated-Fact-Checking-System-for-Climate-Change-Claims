import "server-only";

import { LABELS, type Label } from "@/lib/labels";
import type { RuleId } from "@/lib/retrieval";
import type {
  Histories,
  HistoryPoint,
  LengthBucket,
  Protocol,
  SweepParam,
  Sweeps,
} from "@/lib/types";
import { getDb, getMeta } from "./db";

export type ReportNumbers = {
  validation: { f: number; accuracy: number; hm: number };
  test: { f: number; accuracy: number; hm: number };
  transformer_val_acc: number;
  lstm_val_acc: number;
  corpus_size: number;
};

export type RetrievalMetrics = {
  dev_f_saved_2024: number;
  dev_f_submission_rerun: number;
  dev_f_notebook_rerun: number;
  dev_f_notebook_raw_claim: number;
  dev_precision_saved_2024: number;
  dev_recall_saved_2024: number;
  dev_fallback_share_submission: number;
  dev_claims_with_any_hit_saved_2024: number;
};

export type RetrievalParity = Record<
  "dev" | "test",
  {
    total: number;
    submission_exact: number;
    submission_same_set: number;
    submission_equal_up_to_ties: number;
    notebook_exact: number;
  }
>;

export type ClassifierMetrics = {
  dev_acc_retrieved_batch: number;
  dev_acc_retrieved_single: number;
  dev_acc_gold_batch: number;
  dev_f: number;
  dev_hm_batch: number;
  majority_baseline_acc: number;
  token_table_max_err: number;
  vocab_size: number;
  params_transformer: number;
  params_lstm: number;
  seed: number;
  torch: string;
};

export type IndexInfo = {
  passages: number;
  retrievable: number;
  gold: number;
  pool: number;
  sample: number;
  sample_seed: number;
  corpus_rows: number;
  corpus_total: number;
};

export type NotebookPrinted = {
  cell10_claim_tags: string;
  cell16_keywords: string;
  cell26_retrieved: string[];
  cell58_dev_eval: { f: number; accuracy: number; hm: number };
};

export type ModelInfo = {
  labels: string[];
  max_len: number;
  bias: number[];
  vocab_size: number;
  model_dim: number;
  num_heads: number;
  num_encoder_layers: number;
  dim_feedforward: number;
  dropout: number;
  lstm_layers: number;
  epochs: number;
  batch_size: number;
  lr: number;
  optimizer: string;
};

export function getOverview() {
  return {
    report: getMeta<ReportNumbers>("report"),
    retrieval: getMeta<RetrievalMetrics>("retrieval_metrics"),
    parity: getMeta<RetrievalParity>("retrieval_parity"),
    classifier: getMeta<ClassifierMetrics>("classifier_metrics"),
    index: getMeta<IndexInfo>("index"),
    printed: getMeta<NotebookPrinted>("notebook_printed"),
    model: getMeta<ModelInfo>("model"),
    claims: getMeta<Record<"train" | "dev" | "test", number>>("claims"),
    lengthsMatchReport: getMeta<boolean>("passage_lengths_match_report"),
  };
}

export type Overview = ReturnType<typeof getOverview>;

/** Gold label counts for the labelled splits. */
export function labelDistribution(): Record<"train" | "dev", Record<Label, number>> {
  const out = {
    train: Object.fromEntries(LABELS.map((l) => [l, 0])) as Record<Label, number>,
    dev: Object.fromEntries(LABELS.map((l) => [l, 0])) as Record<Label, number>,
  };
  const rows = getDb()
    .prepare(
      "SELECT split, label, COUNT(*) AS n FROM claims WHERE split IN ('train', 'dev') GROUP BY split, label",
    )
    .all() as { split: "train" | "dev"; label: Label; n: number }[];
  for (const r of rows) out[r.split][r.label] = r.n;
  return out;
}

/** dev confusion matrix [gold][predicted] and accuracy for one prediction protocol. */
export function confusion(protocol: Protocol): {
  matrix: number[][];
  accuracy: number;
  total: number;
} {
  const rows = getDb()
    .prepare(
      `SELECT c.label AS gold, p.label AS pred, COUNT(*) AS n
         FROM predictions p JOIN claims c USING (claim_id)
        WHERE c.split = 'dev' AND p.protocol = ?
        GROUP BY c.label, p.label`,
    )
    .all(protocol) as { gold: Label; pred: Label; n: number }[];
  const matrix = LABELS.map(() => LABELS.map(() => 0));
  let correct = 0;
  let total = 0;
  for (const r of rows) {
    matrix[LABELS.indexOf(r.gold)][LABELS.indexOf(r.pred)] += r.n;
    total += r.n;
    if (r.gold === r.pred) correct += r.n;
  }
  return { matrix, accuracy: total ? correct / total : 0, total };
}

export function trainingHistories(): Histories {
  const rows = getDb()
    .prepare("SELECT * FROM training_history ORDER BY run, model, epoch")
    .all() as {
    run: "2024" | "2026";
    model: "transformer" | "lstm";
    epoch: number;
    train_loss: number;
    val_loss: number;
    train_acc: number;
    val_acc: number;
  }[];
  const out: Histories = {
    "2024": { transformer: [], lstm: [] },
    "2026": { transformer: [], lstm: [] },
  };
  for (const r of rows) {
    const point: HistoryPoint = {
      epoch: r.epoch,
      trainLoss: r.train_loss,
      valLoss: r.val_loss,
      trainAcc: r.train_acc,
      valAcc: r.val_acc,
    };
    out[r.run][r.model].push(point);
  }
  return out;
}

export function retrievalSweeps(): Sweeps {
  const rows = getDb().prepare("SELECT * FROM sweeps ORDER BY config, param, value").all() as {
    config: RuleId;
    param: SweepParam;
    value: number;
    precision: number;
    recall: number;
    f: number;
    avg_retrieved: number;
    fallback_share: number;
  }[];
  const empty = () => ({ t_sim: [], t_overlap: [], t_combined: [], top_n: [] });
  const out: Sweeps = { submission: empty(), notebook: empty() };
  for (const r of rows) {
    out[r.config][r.param].push({
      value: r.value,
      precision: r.precision,
      recall: r.recall,
      f: r.f,
      avgRetrieved: r.avg_retrieved,
      fallbackShare: r.fallback_share,
    });
  }
  return out;
}

export function passageLengths(): LengthBucket[] {
  return (
    getDb().prepare("SELECT * FROM passage_lengths ORDER BY ord").all() as {
      bucket: string;
      min_words: number;
      max_words: number | null;
      count: number;
      report_count: number;
    }[]
  ).map((r) => ({
    bucket: r.bucket,
    minWords: r.min_words,
    maxWords: r.max_words,
    count: r.count,
    reportCount: r.report_count,
  }));
}

/** dev-set accuracy of every prediction protocol. */
export function protocolAccuracies(): Record<Protocol, number> {
  const rows = getDb()
    .prepare(
      `SELECT p.protocol, AVG(p.label = c.label) AS acc
         FROM predictions p JOIN claims c USING (claim_id)
        WHERE c.split = 'dev' GROUP BY p.protocol`,
    )
    .all() as { protocol: Protocol; acc: number }[];
  return Object.fromEntries(rows.map((r) => [r.protocol, r.acc])) as Record<Protocol, number>;
}
