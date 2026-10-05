import { describe, expect, it } from "vitest";

import { getDb } from "@/server/db";
import { evidenceScore, harmonicMean, mean, systemScore } from "./metrics";

describe("eval.py port", () => {
  it("scores evidence like the course script", () => {
    expect(evidenceScore([], ["a"])).toEqual({ precision: 0, recall: 0, f: 0, correct: 0 });
    expect(evidenceScore(["x", "y"], ["a"]).f).toBe(0);
    const s = evidenceScore(["a", "b", "c", "d"], ["a", "b"]);
    expect(s.precision).toBe(0.5);
    expect(s.recall).toBe(1);
    expect(s.f).toBeCloseTo(2 / 3, 15);
  });

  it("harmonic mean is 0 when both inputs are 0", () => {
    expect(harmonicMean(0, 0)).toBe(0);
    expect(mean([])).toBe(0);
  });

  it("reproduces the harmonic mean printed by notebook cell 58", () => {
    expect(harmonicMean(0.011205281010475814, 0.35064935064935066)).toBeCloseTo(
      0.021716590953355812,
      15,
    );
  });

  it("is consistent with the report's Table 2 (rounded to 5 dp)", () => {
    // validation: F from the saved retrieval, accuracy 0.55844 = 86 / 154
    expect(86 / 154).toBeCloseTo(0.55844, 5);
    expect(harmonicMean(0.04299207286220274, 86 / 154)).toBeCloseTo(0.07984, 5);
    expect(harmonicMean(0.0331, 0.4079)).toBeCloseTo(0.0612, 4);
  });

  it("recomputes the reported dev F = 0.04299 from the team's saved retrieval", () => {
    const db = getDb();
    const claims = db.prepare("SELECT claim_id, label FROM claims WHERE split = 'dev'").all() as {
      claim_id: string;
      label: string;
    }[];
    const ids = (cid: string, sql: string) =>
      (db.prepare(sql).all(cid) as { evidence_id: string }[]).map((r) => r.evidence_id);
    const rows = claims.map((c) => ({
      retrieved: ids(
        c.claim_id,
        "SELECT evidence_id FROM retrieval WHERE claim_id = ? AND run = 'saved_2024' ORDER BY rank",
      ),
      gold: ids(
        c.claim_id,
        "SELECT evidence_id FROM claim_evidence WHERE claim_id = ? ORDER BY rank",
      ),
      predicted: c.label,
      label: c.label,
    }));
    const score = systemScore(rows);
    expect(score.f).toBeCloseTo(0.04299207286220274, 15);
    expect(score.accuracy).toBe(1);
  });
});
