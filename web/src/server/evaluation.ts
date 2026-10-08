import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { buildFactCheckPrompt } from "@/lib/ai/fact-check";
import { baselineReport, type BaselineReport, type BaselineRow } from "@/lib/evaluation/baseline";
import type { HarnessClaim, HarnessClaimSummary } from "@/lib/evaluation/harness";
import {
  summarizeSeedSpread,
  type SeedSpread,
  type SeedSpreadFile,
} from "@/lib/evaluation/seed-spread";
import type { Label } from "@/lib/labels";
import type { Protocol } from "@/lib/types";
import { getDb } from "./db";

/**
 * Dev-set rows for the evaluation pages: gold labels, the retrained classifier's
 * stored predictions under each protocol, and the evidence ids/text it saw.
 */

type DevDbRow = { claim_id: string; ord: number; claim_text: string; label: Label };

function devClaims(): DevDbRow[] {
  return getDb()
    .prepare("SELECT claim_id, ord, claim_text, label FROM claims WHERE split = 'dev' ORDER BY ord")
    .all() as DevDbRow[];
}

function predictionsByClaim(): Map<string, Record<Protocol, Label>> {
  const rows = getDb()
    .prepare(
      `SELECT p.claim_id, p.protocol, p.label FROM predictions p
         JOIN claims c USING (claim_id) WHERE c.split = 'dev'`,
    )
    .all() as { claim_id: string; protocol: Protocol; label: Label }[];
  const out = new Map<string, Record<Protocol, Label>>();
  for (const r of rows) {
    const entry = out.get(r.claim_id) ?? ({} as Record<Protocol, Label>);
    entry[r.protocol] = r.label;
    out.set(r.claim_id, entry);
  }
  return out;
}

type Passage = { id: string; text: string };

/** claim id -> passages, in rank order */
function passagesByClaim(sql: string): Map<string, Passage[]> {
  const rows = getDb().prepare(sql).all() as {
    claim_id: string;
    evidence_id: string;
    text: string;
  }[];
  const out = new Map<string, Passage[]>();
  for (const r of rows) {
    const list = out.get(r.claim_id) ?? [];
    list.push({ id: r.evidence_id, text: r.text });
    out.set(r.claim_id, list);
  }
  return out;
}

function retrievedPassages() {
  return passagesByClaim(
    `SELECT r.claim_id, r.evidence_id, e.text FROM retrieval r
       JOIN evidence e USING (evidence_id) JOIN claims c USING (claim_id)
      WHERE r.run = 'saved_2024' AND c.split = 'dev' ORDER BY r.claim_id, r.rank`,
  );
}

function goldPassages() {
  return passagesByClaim(
    `SELECT g.claim_id, g.evidence_id, e.text FROM claim_evidence g
       JOIN evidence e USING (evidence_id) JOIN claims c USING (claim_id)
      WHERE c.split = 'dev' ORDER BY g.claim_id, g.rank`,
  );
}

/** The inputs of the baseline report (ids only). */
export function baselineRows(): BaselineRow[] {
  const preds = predictionsByClaim();
  const retrieved = retrievedPassages();
  const gold = goldPassages();
  return devClaims().map((c) => ({
    id: c.claim_id,
    label: c.label,
    predictions: preds.get(c.claim_id) as Record<Protocol, Label>,
    retrieved: (retrieved.get(c.claim_id) ?? []).map((p) => p.id),
    gold: (gold.get(c.claim_id) ?? []).map((p) => p.id),
  }));
}

let report: BaselineReport | undefined;

/** The baseline report with intervals (10,000 resamples, computed once per server instance). */
export function getBaselineReport(): BaselineReport {
  report ??= baselineReport(baselineRows());
  return report;
}

/** Everything the LLM harness needs for every dev claim, evidence text included. */
export function harnessClaims(): HarnessClaim[] {
  const preds = predictionsByClaim();
  const retrieved = retrievedPassages();
  const gold = goldPassages();
  return devClaims().map((c) => {
    const p = preds.get(c.claim_id) as Record<Protocol, Label>;
    return {
      id: c.claim_id,
      ord: c.ord,
      text: c.claim_text,
      label: c.label,
      classifier: { retrieved: p.batch, gold: p.gold_evidence },
      retrieved: retrieved.get(c.claim_id) ?? [],
      gold: gold.get(c.claim_id) ?? [],
    };
  });
}

/** The same without passage text, small enough to render into the page. */
export function harnessClaimSummaries(): HarnessClaimSummary[] {
  const chars = (text: string, passages: Passage[]) => {
    const { system, user } = buildFactCheckPrompt(text, passages);
    return system.length + user.length;
  };
  return harnessClaims().map(({ retrieved, gold, ...rest }) => ({
    ...rest,
    retrievedIds: retrieved.map((p) => p.id),
    goldIds: gold.map((p) => p.id),
    promptChars: { retrieved: chars(rest.text, retrieved), gold: chars(rest.text, gold) },
  }));
}

/** The raw output of `scripts/seed_spread.py` (read at build time). */
export function seedSpreadFile(): SeedSpreadFile {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), "data", "seed-spread.json"), "utf8"),
  ) as SeedSpreadFile;
}

/** Transformer and LSTM retrained under five seeds, summarised against the dev labels. */
export function getSeedSpread(): SeedSpread {
  const gold = new Map(devClaims().map((c) => [c.claim_id, c.label as string]));
  return summarizeSeedSpread(seedSpreadFile(), gold);
}
