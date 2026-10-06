import { describe, expect, it } from "vitest";

import { getDb, getMeta } from "@/server/db";
import freeText from "./__fixtures__/free-text.json";
import { getEvidenceIndex, getTagModel } from "@/server/models";
import { evidenceScore, mean } from "./metrics";
import {
  claimTagsOf,
  EmptyClaimError,
  findTopEvidence,
  prepareIndex,
  pyStrCompare,
  RULES,
  scoreEvidence,
  selectEvidence,
  type RuleId,
  type ScoredEvidence,
} from "./retrieval";
import { preprocessAndTokenize } from "./text/preprocess";

const s = (
  id: string,
  sim: number,
  overlap: number,
  maxMatch: number,
  w: 1 | 2 = 1,
): ScoredEvidence => ({
  evidenceId: id,
  sim,
  overlap,
  combined: w === 2 ? 2 * sim + overlap : sim + overlap,
  maxMatch,
});

describe("selection rule (find_top_evidence)", () => {
  it("keeps only filter passes that share the largest word overlap", () => {
    const out = selectEvidence(
      [s("a", 0.9, 0.6, 2), s("b", 0.6, 0.75, 3), s("c", 0.7, 1, 3), s("d", 0.5, 1, 4)],
      RULES.submission,
    );
    expect(out.path).toBe("filtered");
    expect(out.nFiltered).toBe(3); // d fails sim > 0.55
    expect(out.selected.map((x) => x.evidenceId)).toEqual(["c", "b"]);
  });

  it("falls back to the top-n combined scores when nothing passes", () => {
    const scored = Array.from({ length: 10 }, (_, i) => s(`e${i}`, i / 20, 0.2, 1));
    const out = selectEvidence(scored, RULES.submission);
    expect(out.path).toBe("fallback");
    expect(out.selected.map((x) => x.evidenceId)).toEqual(["e9", "e8", "e7", "e6", "e5", "e4"]);
  });

  it("breaks ties in input order, like a stable pandas sort", () => {
    const scored = [s("x", 0.1, 0, 0), s("y", 0.3, 0, 0), s("z", 0.3, 0, 0), s("w", 0.3, 0, 0)];
    const out = selectEvidence(scored, { ...RULES.submission, topN: 2 });
    expect(out.selected.map((x) => x.evidenceId)).toEqual(["y", "z"]);
  });

  it("scores overlap against the smaller tag set and counts sim twice for the notebook rule", () => {
    const index = prepareIndex([
      { evidenceId: "p", tags: "ice sheet melt", vec: { idx: [1, 2], w: [1, 1] } },
    ]);
    const [sub] = scoreEvidence("ice melt sea", { idx: [1], w: [1] }, index, 1);
    const [nb] = scoreEvidence("ice melt sea", { idx: [1], w: [1] }, index, 2);
    expect(sub.overlap).toBeCloseTo(2 / 3, 15);
    expect(sub.sim).toBeCloseTo(Math.SQRT1_2, 15);
    expect(nb.combined - sub.combined).toBeCloseTo(sub.sim, 15);
  });

  it("refuses a claim with no content words (the original divides by zero)", () => {
    expect(() => scoreEvidence("", { idx: [], w: [] }, [], 1)).toThrow(EmptyClaimError);
  });

  it("sorts strings by code point like Python", () => {
    expect(["b", "B", "a", "é"].sort(pyStrCompare)).toEqual(["B", "a", "b", "é"]);
  });
});

type Stored = { evidence_id: string; combined: number };

/** Same passages with the same scores; ids may differ only inside a tie group at the cut-off. */
function equalUpToTies(a: Stored[], b: Stored[]): boolean {
  if (a.length !== b.length) return false;
  if (a.some((x, i) => Math.abs(x.combined - b[i].combined) > 1e-9)) return false;
  const cutoff = Math.min(...a.map((x) => x.combined));
  const key = (x: Stored) => x.combined.toFixed(9);
  const groups = (xs: Stored[]) => {
    const m = new Map<string, string[]>();
    for (const x of xs)
      if (x.combined - cutoff > 1e-9)
        m.set(key(x), [...(m.get(key(x)) ?? []), x.evidence_id].sort());
    return JSON.stringify([...m.entries()].sort());
  };
  return groups(a) === groups(b);
}

describe("parity with the full-corpus Python run (pruned index)", () => {
  const db = getDb();
  const index = getEvidenceIndex();
  const tag = getTagModel();
  const claims = db
    .prepare(
      "SELECT claim_id, split, claim_text, tags FROM claims WHERE split IN ('dev', 'test') ORDER BY split, ord",
    )
    .all() as { claim_id: string; split: string; claim_text: string; tags: string }[];
  const storedRun = db.prepare(
    "SELECT evidence_id, combined FROM retrieval WHERE claim_id = ? AND run = ? ORDER BY rank",
  );
  const gold = db.prepare(
    "SELECT evidence_id FROM claim_evidence WHERE claim_id = ? ORDER BY rank",
  );

  it("computes every dev claim's tags exactly like Python", () => {
    // only dev claims carry their text; train/test keep the derived tags
    const all = db
      .prepare("SELECT claim_text, tags FROM claims WHERE claim_text IS NOT NULL")
      .all() as {
      claim_text: string;
      tags: string;
    }[];
    const bad = all.filter((c) => claimTagsOf(c.claim_text, preprocessAndTokenize) !== c.tags);
    expect(bad.slice(0, 3)).toEqual([]);
    expect(all).toHaveLength(154);
    expect(db.prepare("SELECT COUNT(*) AS n FROM claims").get()).toEqual({ n: 1228 + 154 + 153 });
  });

  it("reproduces notebook cell 26 for claim-752", () => {
    const r = findTopEvidence(
      "australia electr expens south world",
      tag,
      preprocessAndTokenize,
      index,
      RULES.notebook,
    );
    expect(r.selected.map((x) => x.evidenceId)).toEqual(
      getMeta<{ cell26_retrieved: string[] }>("notebook_printed").cell26_retrieved,
    );
  });

  const runs: {
    run: "submission" | "notebook" | "notebook_raw";
    rule: RuleId;
    splits: string[];
  }[] = [
    { run: "submission", rule: "submission", splits: ["dev", "test"] },
    { run: "notebook", rule: "notebook", splits: ["dev", "test"] },
    { run: "notebook_raw", rule: "notebook", splits: ["dev"] },
  ];

  for (const { run, rule, splits } of runs) {
    it(`selects the same passages as Python for every ${splits.join("+")} claim (${run})`, () => {
      let exact = 0;
      const mismatched: string[] = [];
      const fDev: number[] = [];
      for (const c of claims.filter((x) => splits.includes(x.split))) {
        const query = run === "notebook_raw" ? c.claim_text : c.tags;
        const ts = findTopEvidence(query, tag, preprocessAndTokenize, index, RULES[rule]);
        const mine = ts.selected.map((x) => ({ evidence_id: x.evidenceId, combined: x.combined }));
        const py = storedRun.all(c.claim_id, run) as Stored[];
        if (
          JSON.stringify(mine.map((x) => x.evidence_id)) ===
          JSON.stringify(py.map((x) => x.evidence_id))
        )
          exact++;
        else if (!equalUpToTies(mine, py)) mismatched.push(c.claim_id);
        if (c.split === "dev") {
          const g = (gold.all(c.claim_id) as { evidence_id: string }[]).map((x) => x.evidence_id);
          fDev.push(
            evidenceScore(
              ts.selected.map((x) => x.evidenceId),
              g,
            ).f,
          );
        }
      }
      expect(mismatched).toEqual([]);
      expect(exact).toBeGreaterThan(0);
      const expected: Record<string, number> = {
        submission: 0.04299207286220274, // report Table 2, validation F
        notebook: 0.04181143531792883,
        notebook_raw: 0.011205281010475814, // printed by notebook cell 58
      };
      expect(mean(fDev)).toBeCloseTo(expected[run], 12);
    }, 120_000);
  }
});

type FullRun = { ids: string[]; path: "filtered" | "fallback"; combined: number[] };
type FreeTextCase = { text: string; tags: string } & Record<RuleId, FullRun>;

/** Does the pruned index pick what the full 1.19M-passage Python run picked? */
function agreesWithFullCorpus(c: FreeTextCase, rule: RuleId): boolean {
  const ts = findTopEvidence(
    c.tags,
    getTagModel(),
    preprocessAndTokenize,
    getEvidenceIndex(),
    RULES[rule],
  );
  const full = c[rule];
  return (
    ts.path === full.path &&
    equalUpToTies(
      ts.selected.map((x) => ({ evidence_id: x.evidenceId, combined: x.combined })),
      full.ids.map((id, i) => ({ evidence_id: id, combined: full.combined[i] })),
    )
  );
}

describe("free-text claims vs the full-corpus Python run", () => {
  const rules: RuleId[] = ["submission", "notebook"];

  it("returns the full-corpus selection for every Try-it example", () => {
    const examples = getMeta<{ text: string; tags: string }[]>("try_examples");
    expect(examples.map((e) => e.text)).toEqual(freeText.examples.map((e) => e.text));
    for (const c of freeText.examples as FreeTextCase[]) {
      expect(claimTagsOf(c.text, preprocessAndTokenize)).toBe(c.tags);
      for (const rule of rules)
        expect(agreesWithFullCorpus(c, rule), `${c.text} (${rule})`).toBe(true);
    }
  });

  it("agrees with it on held-out claims exactly as often as the site says", () => {
    const parity = getMeta<
      { claims: number } & Record<
        RuleId,
        { agree: number; by_path: Record<"filtered" | "fallback", [number, number]> }
      >
    >("free_text_parity");
    const heldout = freeText.heldout as FreeTextCase[];
    expect(parity.claims).toBe(heldout.length);
    for (const rule of rules) {
      const byPath = { filtered: [0, 0], fallback: [0, 0] };
      for (const c of heldout) {
        expect(claimTagsOf(c.text, preprocessAndTokenize)).toBe(c.tags);
        const ok = agreesWithFullCorpus(c, rule);
        byPath[c[rule].path][0] += Number(ok);
        byPath[c[rule].path][1] += 1;
      }
      expect(byPath).toEqual(parity[rule].by_path);
      expect(byPath.filtered[0] + byPath.fallback[0]).toBe(parity[rule].agree);
    }
  }, 60_000);
});
