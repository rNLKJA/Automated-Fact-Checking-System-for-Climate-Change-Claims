import { describe, expect, it } from "vitest";

import { getDb } from "@/server/db";
import { decodeVec, getKeywordModel, getTagModel } from "@/server/models";
import { l2Normalize, sparseDot, tfidfTransform, topKeywords, wordNgrams } from "./tfidf";
import { preprocessAndTokenize } from "./text/preprocess";
import { pySplit } from "./text/pystr";

describe("tfidf helpers", () => {
  it("builds sklearn word n-grams", () => {
    expect(wordNgrams(["a", "b", "c"], [1, 2])).toEqual(["a", "b", "c", "a b", "b c"]);
    expect(wordNgrams(["a", "b", "c"], [1, 3])).toEqual(["a", "b", "c", "a b", "b c", "a b c"]);
    expect(wordNgrams(["a", "b"], [1, 1])).toEqual(["a", "b"]);
  });

  it("normalises and multiplies sparse vectors", () => {
    const v = l2Normalize({ idx: [0, 3], w: [3, 4] });
    expect(v.w).toEqual([0.6, 0.8]);
    expect(sparseDot(v, { idx: [3, 7], w: [1, 1] })).toBeCloseTo(0.8, 15);
    expect(l2Normalize({ idx: [], w: [] })).toEqual({ idx: [], w: [] });
  });
});

describe("parity with the team's fitted vectorizers", () => {
  const tag = getTagModel();
  const keyword = getKeywordModel();

  it("loads both vectorizers with their 2024 vocabularies", () => {
    expect(tag.terms).toHaveLength(1000);
    expect(keyword.terms).toHaveLength(20000);
  });

  it("recomputes the stored evidence_tfidf rows from the evidence tags", () => {
    const rows = getDb()
      .prepare("SELECT tags, vec FROM evidence WHERE tags IS NOT NULL ORDER BY ord LIMIT 3000")
      .all() as { tags: string; vec: Uint8Array }[];
    let worst = 0;
    for (const r of rows) {
      const stored = decodeVec(r.vec);
      const mine = tfidfTransform(tag, r.tags, preprocessAndTokenize);
      expect(mine.idx).toEqual(stored.idx);
      mine.w.forEach((w, k) => (worst = Math.max(worst, Math.abs(w - stored.w[k]))));
    }
    expect(worst).toBeLessThan(1e-12);
  });

  it("reproduces the keywords printed by notebook cell 16", () => {
    const claim =
      "When 3 per cent of total annual global emissions of carbon dioxide are from humans and Australia produces 1.3 per cent of this 3 per cent, then no amount of emissions reduction here will have any effect on global climate.";
    const got = new Set(topKeywords(tag, claim, preprocessAndTokenize).map((k) => k.term));
    expect(got).toEqual(
      new Set("climat total produc human annual effect global australia per carbon".split(" ")),
    );
  });

  it("regenerates the team's evidence tags with the 20k keyword vectorizer", () => {
    const rows = getDb()
      .prepare("SELECT text, tags FROM evidence WHERE tags IS NOT NULL ORDER BY ord LIMIT 2000")
      .all() as { text: string; tags: string }[];
    const mismatches = rows.filter((r) => {
      const mine = new Set(topKeywords(keyword, r.text, preprocessAndTokenize).map((k) => k.term));
      const theirs = new Set(pySplit(r.tags));
      return mine.size !== theirs.size || [...mine].some((t) => !theirs.has(t));
    });
    expect(mismatches.slice(0, 3)).toEqual([]);
  });
});
