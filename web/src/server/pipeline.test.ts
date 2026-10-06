import { describe, expect, it } from "vitest";

import freeText from "@/lib/__fixtures__/free-text.json";
import { EmptyClaimError } from "@/lib/retrieval";
import { getDb } from "./db";
import { checkClaim } from "./pipeline";

describe("checkClaim (Try-it pipeline)", () => {
  it("reproduces the 2024 retrieval and the single-claim verdict for a dev claim", () => {
    const db = getDb();
    const claim = db
      .prepare("SELECT claim_text FROM claims WHERE claim_id = 'claim-752'")
      .get() as { claim_text: string };
    const saved = (
      db
        .prepare(
          "SELECT evidence_id FROM retrieval WHERE claim_id = 'claim-752' AND run = 'saved_2024' ORDER BY rank",
        )
        .all() as {
        evidence_id: string;
      }[]
    ).map((r) => r.evidence_id);
    const single = db
      .prepare("SELECT label FROM predictions WHERE claim_id = 'claim-752' AND protocol = 'single'")
      .get() as {
      label: string;
    };
    const r = checkClaim(claim.claim_text);
    expect(r.claimTags).toBe("australia electr expens south world");
    expect(r.retrieval.passages.map((p) => p.id)).toEqual(saved);
    expect(
      r.retrieval.passages.some((p) =>
        p.goldFor.some((g) => g.id === "claim-752" && g.split === "dev"),
      ),
    ).toBe(true);
    expect(r.classification.label).toBe(single.label);
    expect(r.retrieval.verified).toBe(true);
    expect(r.classification.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(r.classification.inputTokens + r.classification.padding).toBe(128);
  });

  it("rejects claims made only of stopwords, where the original would divide by zero", () => {
    expect(() => checkClaim("They were not there, were they?")).toThrow(EmptyClaimError);
  });

  it("marks the examples as verified and other free text as not", () => {
    for (const ex of freeText.examples) {
      const r = checkClaim(ex.text);
      expect(r.retrieval.verified, ex.text).toBe(true);
      expect(r.retrieval.path).toBe(ex.submission.path);
    }
    const unseen = checkClaim(freeText.heldout[0].text);
    expect(unseen.retrieval.verified).toBe(false);
  });

  it("supports the committed-notebook scoring rule", () => {
    const r = checkClaim("Arctic sea ice is shrinking", "notebook");
    expect(r.rule).toBe("notebook");
    r.retrieval.passages.forEach((p) => expect(p.combined).toBeCloseTo(2 * p.sim + p.overlap, 12));
  });
});
