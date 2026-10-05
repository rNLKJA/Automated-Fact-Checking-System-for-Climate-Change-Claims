/**
 * Plain data shapes shared by the server layer (`src/server`) and the UI.
 * Everything here is serialisable so it can cross the Server -> Client boundary.
 */
import type { Label } from "./labels";
import type { RuleId } from "./retrieval";

/** Which retrieval list a row belongs to. */
export type RunId = "saved_2024" | "submission" | "notebook" | "notebook_raw";

export const RUNS: Record<RunId, { title: string; short: string; description: string }> = {
  saved_2024: {
    title: "2024 submission",
    short: "2024 saved",
    description:
      "The passages the team actually retrieved and submitted in 2024 (their saved output file).",
  },
  submission: {
    title: "Re-run: submission rule",
    short: "Re-run",
    description:
      "The retrieval rule re-run in 2026 over all 1.19M passages, scoring sim + overlap. It reproduces the saved 2024 lists up to the order of exactly tied scores.",
  },
  notebook: {
    title: "Re-run: notebook rule",
    short: "Notebook",
    description:
      "The rule exactly as committed in the notebook, which adds the cosine similarity twice (sim + overlap + sim).",
  },
  notebook_raw: {
    title: "Notebook final cell",
    short: "Raw claim",
    description:
      "The committed notebook's last evaluation cell passed the raw claim text instead of its stemmed tags. That is why the notebook prints F = 0.011.",
  },
};

/** How a prediction was produced. */
export type Protocol = "batch" | "single" | "gold_evidence";

export const PROTOCOLS: Record<Protocol, { title: string; description: string }> = {
  batch: {
    title: "Notebook protocol",
    description:
      "Dev claims predicted in batches of 16, in file order, from the 2024 retrieved evidence, as the notebook does.",
  },
  single: {
    title: "One claim at a time",
    description: "The same model run on a single claim, which is how the Try-it page runs it.",
  },
  gold_evidence: {
    title: "With gold evidence",
    description:
      "Fed the human-annotated evidence instead of retrieved passages. This is the 'val accuracy' the training loop reports.",
  },
};

export type Split = "train" | "dev" | "test";

export type ClaimRow = {
  id: string;
  split: Split;
  ord: number;
  text: string;
  label: Label | null;
  tags: string;
};

/** One dev claim in the Explore list. */
export type ClaimSummary = {
  id: string;
  ord: number;
  text: string;
  label: Label;
  predicted: Label;
  f: number;
  nCorrect: number;
  nRetrieved: number;
  nGold: number;
  path: "filtered" | "fallback";
};

export type EvidencePassage = {
  id: string;
  text: string;
  tags: string | null;
};

export type RetrievedPassage = EvidencePassage & {
  rank: number;
  sim: number;
  overlap: number;
  combined: number;
  maxMatch: number;
  isGold: boolean;
};

export type RunSummary = {
  run: RunId;
  path: "filtered" | "fallback";
  nFiltered: number;
  nRetrieved: number;
  nCorrect: number | null;
  precision: number | null;
  recall: number | null;
  f: number | null;
};

export type PredictionRow = {
  protocol: Protocol;
  label: Label;
  probs: number[];
  logits: number[] | null;
};

export type ClaimDetail = {
  claim: ClaimRow;
  gold: EvidencePassage[];
  runs: { summary: RunSummary; passages: RetrievedPassage[] }[];
  predictions: PredictionRow[];
  prevId: string | null;
  nextId: string | null;
};

export type HistoryPoint = {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  trainAcc: number;
  valAcc: number;
};

export type Histories = Record<"2024" | "2026", Record<"transformer" | "lstm", HistoryPoint[]>>;

export type SweepPoint = {
  value: number;
  precision: number;
  recall: number;
  f: number;
  avgRetrieved: number;
  fallbackShare: number;
};

export type SweepParam = "t_sim" | "t_overlap" | "t_combined" | "top_n";

export type Sweeps = Record<RuleId, Record<SweepParam, SweepPoint[]>>;

export type LengthBucket = {
  bucket: string;
  minWords: number;
  maxWords: number | null;
  count: number;
  reportCount: number;
};

/** Everything the Try-it page shows for one claim. */
export type CheckResponse = {
  claim: string;
  rule: RuleId;
  trace: {
    expanded: string;
    tokens: string[];
    kept: string[];
    stems: string[];
    dropped: string[];
  };
  claimTags: string;
  tagTerms: { term: string; weight: number }[];
  retrieval: {
    path: "filtered" | "fallback";
    nFiltered: number;
    indexSize: number;
    tookMs: number;
    passages: (EvidencePassage & {
      sim: number;
      overlap: number;
      combined: number;
      maxMatch: number;
      matchedTags: string[];
      goldFor: { id: string; split: Split }[];
    })[];
  };
  classification: {
    label: Label;
    probs: number[];
    logits: number[];
    bias: number[];
    inputTokens: number;
    truncated: boolean;
    unknownTokens: number;
    padding: number;
    contributions: { token: string; count: number; centred: number[] }[];
  };
};
