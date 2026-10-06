import "server-only";

import { isLabel, type Label } from "@/lib/labels";
import type {
  ClaimDetail,
  ClaimRow,
  ClaimSummary,
  EvidencePassage,
  PredictionRow,
  Protocol,
  RetrievedPassage,
  RunId,
  RunSummary,
  Split,
} from "@/lib/types";
import { getDb } from "./db";

const RUN_ORDER: RunId[] = ["saved_2024", "submission", "notebook", "notebook_raw"];

function asLabel(x: unknown): Label | null {
  return isLabel(x) ? x : null;
}

type ClaimDbRow = {
  claim_id: string;
  split: Split;
  ord: number;
  claim_text: string;
  label: string | null;
  tags: string;
};

function toClaimRow(r: ClaimDbRow): ClaimRow {
  return {
    id: r.claim_id,
    split: r.split,
    ord: r.ord,
    text: r.claim_text,
    label: asLabel(r.label),
    tags: r.tags,
  };
}

/**
 * The 154 dev claims with their 2024 retrieval score and the retrained model's prediction.
 * The saved 2024 file does not record the selection path, so `path` comes from the re-run of
 * the submission rule (identical scores for 152 of the 154 dev claims).
 */
export function listDevClaims(): ClaimSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT c.claim_id, c.ord, c.claim_text, c.label, p.label AS predicted,
              s.f, s.n_correct, s.n_retrieved, r.path,
              (SELECT COUNT(*) FROM claim_evidence g WHERE g.claim_id = c.claim_id) AS n_gold
         FROM claims c
         JOIN predictions p ON p.claim_id = c.claim_id AND p.protocol = 'batch'
         JOIN retrieval_summary s ON s.claim_id = c.claim_id AND s.run = 'saved_2024'
         JOIN retrieval_summary r ON r.claim_id = c.claim_id AND r.run = 'submission'
        WHERE c.split = 'dev'
        ORDER BY c.ord`,
    )
    .all() as {
    claim_id: string;
    ord: number;
    claim_text: string;
    label: string;
    predicted: string;
    f: number;
    n_correct: number;
    n_retrieved: number;
    path: "filtered" | "fallback";
    n_gold: number;
  }[];
  return rows.map((r) => ({
    id: r.claim_id,
    ord: r.ord,
    text: r.claim_text,
    label: r.label as Label,
    predicted: r.predicted as Label,
    f: r.f,
    nCorrect: r.n_correct,
    nRetrieved: r.n_retrieved,
    nGold: r.n_gold,
    path: r.path,
  }));
}

export function listClaimIds(split: Split): string[] {
  return (
    getDb().prepare("SELECT claim_id FROM claims WHERE split = ? ORDER BY ord").all(split) as {
      claim_id: string;
    }[]
  ).map((r) => r.claim_id);
}

/** A dev claim (only dev claims carry their text; train and test keep id, label and tags). */
export function getDevClaim(id: string): ClaimRow | null {
  const row = getDb()
    .prepare("SELECT * FROM claims WHERE claim_id = ? AND split = 'dev'")
    .get(id) as ClaimDbRow | undefined;
  return row ? toClaimRow(row) : null;
}

/**
 * Whether the pruned index is known to reproduce the full-corpus selection for these claim
 * tags: they belong to a dataset claim the build checked (every dev and test claim, which
 * vitest re-checks, and the train claims that passed the same check).
 */
export function isIndexExact(claimTags: string): boolean {
  return (
    getDb()
      .prepare("SELECT 1 FROM claims WHERE tags = ? AND index_exact = 1 LIMIT 1")
      .get(claimTags) !== undefined
  );
}

/** Passages by id, in the order requested (unknown ids are skipped). */
export function getEvidence(ids: readonly string[]): EvidencePassage[] {
  if (ids.length === 0) return [];
  const stmt = getDb().prepare(
    "SELECT evidence_id, text, tags FROM evidence WHERE evidence_id = ?",
  );
  const out: EvidencePassage[] = [];
  for (const id of ids) {
    const r = stmt.get(id) as
      { evidence_id: string; text: string; tags: string | null } | undefined;
    if (r) out.push({ id: r.evidence_id, text: r.text, tags: r.tags });
  }
  return out;
}

/** For each passage id, the train/dev claims that list it as gold evidence. */
export function goldClaimsFor(ids: readonly string[]): Map<string, { id: string; split: Split }[]> {
  const stmt = getDb().prepare(
    `SELECT g.claim_id, c.split FROM claim_evidence g JOIN claims c USING (claim_id)
      WHERE g.evidence_id = ? ORDER BY c.split, c.ord`,
  );
  return new Map(
    ids.map((id) => [
      id,
      (stmt.all(id) as { claim_id: string; split: Split }[]).map((r) => ({
        id: r.claim_id,
        split: r.split,
      })),
    ]),
  );
}

export function getClaimDetail(id: string): ClaimDetail | null {
  const db = getDb();
  const claim = getDevClaim(id);
  if (!claim) return null;

  const goldIds = (
    db
      .prepare("SELECT evidence_id FROM claim_evidence WHERE claim_id = ? ORDER BY rank")
      .all(id) as {
      evidence_id: string;
    }[]
  ).map((r) => r.evidence_id);
  const goldSet = new Set(goldIds);

  const summaries = db.prepare("SELECT * FROM retrieval_summary WHERE claim_id = ?").all(id) as {
    run: RunId;
    path: "filtered" | "fallback" | null;
    n_filtered: number | null;
    n_retrieved: number;
    n_correct: number | null;
    precision: number | null;
    recall: number | null;
    f: number | null;
  }[];
  const rows = db
    .prepare(
      `SELECT r.run, r.rank, r.evidence_id, r.sim, r.overlap, r.combined, r.max_match, e.text, e.tags
         FROM retrieval r JOIN evidence e USING (evidence_id)
        WHERE r.claim_id = ? ORDER BY r.run, r.rank`,
    )
    .all(id) as {
    run: RunId;
    rank: number;
    evidence_id: string;
    sim: number;
    overlap: number;
    combined: number;
    max_match: number;
    text: string;
    tags: string | null;
  }[];

  const runs = RUN_ORDER.flatMap((run) => {
    const s = summaries.find((x) => x.run === run);
    if (!s) return [];
    const summary: RunSummary = {
      run,
      path: s.path,
      nFiltered: s.n_filtered,
      nRetrieved: s.n_retrieved,
      nCorrect: s.n_correct,
      precision: s.precision,
      recall: s.recall,
      f: s.f,
    };
    const passages: RetrievedPassage[] = rows
      .filter((r) => r.run === run)
      .map((r) => ({
        id: r.evidence_id,
        text: r.text,
        tags: r.tags,
        rank: r.rank,
        sim: r.sim,
        overlap: r.overlap,
        combined: r.combined,
        maxMatch: r.max_match,
        isGold: goldSet.has(r.evidence_id),
      }));
    return [{ summary, passages }];
  });

  const predictions: PredictionRow[] = (
    db.prepare("SELECT * FROM predictions WHERE claim_id = ?").all(id) as {
      protocol: Protocol;
      label: string;
      p0: number;
      p1: number;
      p2: number;
      p3: number;
      l0: number | null;
      l1: number | null;
      l2: number | null;
      l3: number | null;
    }[]
  ).map((p) => ({
    protocol: p.protocol,
    label: p.label as Label,
    probs: [p.p0, p.p1, p.p2, p.p3],
    logits: p.l0 === null ? null : [p.l0, p.l1 ?? 0, p.l2 ?? 0, p.l3 ?? 0],
  }));

  const neighbours = db
    .prepare(
      `SELECT
         (SELECT claim_id FROM claims WHERE split = ? AND ord = ? - 1) AS prev_id,
         (SELECT claim_id FROM claims WHERE split = ? AND ord = ? + 1) AS next_id`,
    )
    .get(claim.split, claim.ord, claim.split, claim.ord) as {
    prev_id: string | null;
    next_id: string | null;
  };

  return {
    claim,
    gold: getEvidence(goldIds),
    runs,
    predictions,
    prevId: neighbours.prev_id,
    nextId: neighbours.next_id,
  };
}
