import { describe, expect, it } from "vitest";

import { getDb } from "@/server/db";
import { getClassifier } from "@/server/models";
import {
  buildModelInput,
  classify,
  createClassifier,
  encode,
  softmax,
  tokenContributions,
  type TokenTable,
} from "./classifier";
import { LABELS } from "./labels";
import { preprocessAndTokenize } from "./text/preprocess";

const toy: TokenTable = {
  labels: [...LABELS],
  maxLen: 6,
  tokens: ["<unk>", "[CLS]", "[SEP]", "[PAD]", "ice", "melt"],
  bias: [0.1, 0, 0, -0.1],
  g: [
    [0, 0, 0, 0],
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [6, 0, 0, 0],
    [0, 0, 0, 6],
  ],
};

describe("CustomTokenizer.encode", () => {
  const clf = createClassifier(toy);

  it("wraps in [CLS] ... [SEP], maps unknown words to <unk> and pads", () => {
    expect(encode(clf, "ice glacier")).toEqual([1, 4, 0, 2, 3, 3]);
  });

  it("truncates to max length and keeps a final [SEP]", () => {
    expect(encode(clf, "ice ice ice ice ice ice ice")).toEqual([1, 4, 4, 4, 4, 2]);
  });
});

describe("token-table classifier", () => {
  const clf = createClassifier(toy);

  it("computes bias + mean of the per-token rows", () => {
    const p = classify(clf, "ice");
    // ids [1, 4, 2, 3, 3, 3] -> rows sum = [7, 1, 3, 0] / 6
    expect(p.logits).toEqual([0.1 + 7 / 6, 1 / 6, 3 / 6, -0.1]);
    expect(p.label).toBe("SUPPORTS");
    expect(p.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("attributes the logits exactly to the input tokens", () => {
    const p = classify(clf, "melt ice melt");
    const parts = tokenContributions(clf, p.ids);
    const sum = toy.bias.map((b, k) => b + parts.reduce((a, c) => a + c.logits[k], 0));
    sum.forEach((x, k) => expect(x).toBeCloseTo(p.logits[k], 12));
    expect(parts.find((c) => c.token === "melt")?.count).toBe(2);
  });

  it("softmax is shift invariant and normalised", () => {
    expect(softmax([1, 2, 3])).toEqual(softmax([101, 102, 103]));
  });

  it("builds the model input like combine_claims_evidence_test", () => {
    expect(buildModelInput(["sea", "rise"], [["ice", "melt"], ["ocean"]])).toBe(
      "sea rise ice melt ocean",
    );
  });
});

describe("parity with the retrained PyTorch Transformer", () => {
  const clf = getClassifier();
  const db = getDb();

  it("loads the 2026 retrain's vocabulary", () => {
    expect(clf.tokens.slice(0, 4)).toEqual(["<unk>", "[CLS]", "[SEP]", "[PAD]"]);
    expect(clf.tokens.length).toBeGreaterThan(5000);
  });

  it("reproduces PyTorch's single-claim logits for all 154 dev claims, end to end", () => {
    const claims = db
      .prepare(
        `SELECT c.claim_id, c.claim_text, p.label, p.l0, p.l1, p.l2, p.l3
           FROM claims c JOIN predictions p ON p.claim_id = c.claim_id AND p.protocol = 'single'
          WHERE c.split = 'dev' ORDER BY c.ord`,
      )
      .all() as {
      claim_id: string;
      claim_text: string;
      label: string;
      l0: number;
      l1: number;
      l2: number;
      l3: number;
    }[];
    const evidenceOf = db.prepare(
      `SELECT e.text FROM retrieval r JOIN evidence e USING (evidence_id)
        WHERE r.claim_id = ? AND r.run = 'saved_2024' ORDER BY r.rank`,
    );
    let worst = 0;
    for (const c of claims) {
      const texts = (evidenceOf.all(c.claim_id) as { text: string }[]).map((r) => r.text);
      const input = buildModelInput(
        preprocessAndTokenize(c.claim_text),
        texts.map(preprocessAndTokenize),
      );
      const p = classify(clf, input);
      [c.l0, c.l1, c.l2, c.l3].forEach(
        (l, k) => (worst = Math.max(worst, Math.abs(l - p.logits[k]))),
      );
      expect(p.label).toBe(c.label);
    }
    expect(claims).toHaveLength(154);
    expect(worst).toBeLessThan(1e-5);
  });
});
