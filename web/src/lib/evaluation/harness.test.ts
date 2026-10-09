import { describe, expect, it } from "vitest";

import { harnessClaims, harnessClaimSummaries } from "@/server/evaluation";
import type { Label } from "../labels";
import {
  HARNESS_DEFAULTS,
  parseRun,
  rowsFor,
  runToRows,
  sampleClaims,
  sampleMatchesSeed,
  summarizeCondition,
  verifyRun,
  type HarnessClaimSummary,
  type HarnessRow,
  type HarnessRun,
  type LlmOutcome,
} from "./harness";

const claims = harnessClaimSummaries();
const byId = new Map(claims.map((c) => [c.id, c]));

function ok(label: Label, cited: string[], valid = cited, latencyMs = 900): LlmOutcome {
  return {
    status: "ok",
    label,
    cited,
    valid,
    invalid: cited.filter((c) => !valid.includes(c)),
    rationale: "r",
    latencyMs,
    inputTokens: 800,
    outputTokens: 50,
    auditId: "a",
  };
}

function row(gold: Label, classifier: Label, outcome: LlmOutcome, ids = ["e1", "e2"]): HarnessRow {
  return {
    claimId: `c-${Math.random()}`,
    gold,
    classifier,
    outcome,
    providedIds: ids,
    goldIds: ["e1"],
    retrievedIds: ids,
  };
}

describe("dev set for the harness", () => {
  it("has all 154 dev claims with evidence and stored classifier verdicts", () => {
    const full = harnessClaims();
    expect(full).toHaveLength(154);
    expect(full.every((c) => c.retrieved.length > 0 && c.gold.length > 0)).toBe(true);
    expect(full.every((c) => c.retrieved.every((p) => p.text.length > 0))).toBe(true);
    const c752 = claims.find((c) => c.id === "claim-752") as HarnessClaimSummary;
    expect(c752.retrievedIds).toEqual([
      "evidence-949564",
      "evidence-67732",
      "evidence-572512",
      "evidence-808896",
    ]);
    // stored verdicts reproduce the notebook-protocol and gold-evidence accuracies
    const acc = (k: "retrieved" | "gold") =>
      claims.filter((c) => c.classifier[k] === c.label).length / claims.length;
    expect(acc("retrieved")).toBeCloseTo(0.38311688311688313, 15);
    expect(acc("gold")).toBeCloseTo(0.577922077922078, 15);
  });

  it("samples a reproducible subset in dev-set order", () => {
    const a = sampleClaims(claims, HARNESS_DEFAULTS.n, HARNESS_DEFAULTS.seed);
    const b = sampleClaims(claims, HARNESS_DEFAULTS.n, HARNESS_DEFAULTS.seed);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a).toHaveLength(20);
    expect(a.map((c) => c.ord)).toEqual([...a.map((c) => c.ord)].sort((x, y) => x - y));
    expect(sampleClaims(claims, 20, 43).map((c) => c.id)).not.toEqual(a.map((c) => c.id));
    expect(sampleClaims(claims, 500, 1)).toHaveLength(154);
  });
});

describe("summarizeCondition", () => {
  it("scores both systems on the same claims and compares them pairwise", () => {
    const rows = [
      row("SUPPORTS", "SUPPORTS", ok("SUPPORTS", ["e1"])),
      row("REFUTES", "SUPPORTS", ok("REFUTES", ["e1", "e9"], ["e1"])),
      row("NOT_ENOUGH_INFO", "NOT_ENOUGH_INFO", ok("SUPPORTS", [])),
      row("DISPUTED", "SUPPORTS", ok("DISPUTED", ["e2"])),
    ];
    const s = summarizeCondition("retrieved", rows, { resamples: 400, seed: 1 });
    expect(s).not.toBeNull();
    if (!s) return;
    expect([s.attempted, s.scored, s.excluded, s.invalidOutputs]).toEqual([4, 4, 0, 0]);
    expect(s.llm.accuracy.estimate).toBeCloseTo(0.75, 15);
    expect(s.classifier.accuracy.estimate).toBeCloseTo(0.5, 15);
    expect(s.comparison.difference.estimate).toBeCloseTo(0.25, 15);
    expect([s.comparison.mcnemar.b, s.comparison.mcnemar.c]).toEqual([2, 1]);
    expect(s.citations).toMatchObject({ answers: 4, citing: 3, idsCited: 4, idsInvalid: 1 });
    expect(s.citations.allValid.successes).toBe(2);
    expect(s.citations.allValid.n).toBe(3);
    // LLM cited e1 (gold); e1 plus e9, never shown, which counts as a wrong
    // prediction (F = 2/3); nothing; e2. The classifier "relies on" both shown passages.
    const llmF = (1 + 2 / 3 + 0 + 0) / 4;
    expect(s.evidence.llm.estimate).toBeCloseTo(llmF, 15);
    expect(s.evidence.classifier.estimate).toBeCloseTo(2 / 3, 15);
    expect(s.harmonicMean?.llm.estimate).toBeCloseTo((2 * llmF * 0.75) / (llmF + 0.75), 15);
    expect(s.latencyMs?.median).toBe(900);
    expect(s.tokens).toEqual({ input: 3200, output: 200, calls: 4 });
  });

  it("averages both systems' macro-F1 over one shared label set", () => {
    // both 3 of 4 right; the LLM's "disputed" (absent from gold) must count against
    // the classifier's average too: 0.50 vs 0.45 (sklearn), not 0.50 vs 0.60
    const rows = [
      row("SUPPORTS", "SUPPORTS", ok("SUPPORTS", ["e1"])),
      row("SUPPORTS", "SUPPORTS", ok("SUPPORTS", ["e1"])),
      row("NOT_ENOUGH_INFO", "NOT_ENOUGH_INFO", ok("NOT_ENOUGH_INFO", [])),
      row("REFUTES", "SUPPORTS", ok("DISPUTED", ["e1"])),
    ];
    const s = summarizeCondition("retrieved", rows, { resamples: 300, seed: 3 });
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.llm.labels).toEqual(s.classifier.labels);
    expect(s.llm.macroF1.estimate).toBeCloseTo(0.5, 15);
    expect(s.classifier.macroF1.estimate).toBeCloseTo(0.45, 15);
    expect(s.comparison.macroF1Difference.estimate).toBeCloseTo(0.05, 15);
  });

  it("re-derives citation validity from the cited ids, not the stored lists", () => {
    // a row whose stored lists claim the unseen id e9 was valid
    const tampered = row("SUPPORTS", "SUPPORTS", ok("SUPPORTS", ["e1", "e9"], ["e1", "e9"]));
    const s = summarizeCondition("retrieved", [tampered], { resamples: 50 });
    expect(s?.citations).toMatchObject({ citing: 1, idsCited: 2, idsInvalid: 1 });
    expect(s?.citations.allValid.successes).toBe(0);
    expect(s?.evidence.llm.estimate).toBeCloseTo(2 / 3, 15);
  });

  it("excludes infrastructure failures and counts unusable answers as wrong", () => {
    const rows = [
      row("SUPPORTS", "SUPPORTS", ok("SUPPORTS", ["e1"])),
      row("SUPPORTS", "SUPPORTS", {
        status: "error",
        kind: "rate_limit",
        message: "x",
        auditId: "b",
      }),
      row("REFUTES", "SUPPORTS", {
        status: "invalid_output",
        kind: "invalid_output",
        message: "bad json",
        latencyMs: 1200,
        inputTokens: 700,
        outputTokens: 30,
        auditId: "c",
      }),
    ];
    const s = summarizeCondition("gold", rows, { resamples: 200 });
    expect(s).not.toBeNull();
    if (!s) return;
    expect([s.attempted, s.scored, s.excluded, s.invalidOutputs]).toEqual([3, 2, 1, 1]);
    expect(s.llm.correct).toBe(1);
    // the "no answer" placeholder is not a macro-F1 class
    expect(s.llm.labels).not.toContain("NO_ANSWER");
    expect(s.harmonicMean).toBeNull();
    expect(s.latencyMs?.median).toBe(1050);
    expect(summarizeCondition("gold", [rows[1]])).toBeNull();
  });
});

describe("runs", () => {
  const sample = sampleClaims(claims, 3, 7);
  const run: HarnessRun = {
    format: "climate-claim-checker/llm-eval",
    version: 1,
    startedAt: "2026-10-06T00:00:00.000Z",
    finishedAt: "2026-10-06T00:01:00.000Z",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    n: 3,
    seed: 7,
    conditions: ["retrieved", "gold"],
    claimIds: sample.map((c) => c.id),
    outcomes: {
      [sample[0].id]: {
        retrieved: ok(sample[0].label, [sample[0].retrievedIds[0]]),
        gold: ok(sample[0].label, sample[0].goldIds),
      },
      [sample[1].id]: {
        retrieved: { status: "error", kind: "network", message: "offline", auditId: "z" },
      },
    },
  };

  it("builds rows for the claims that have an outcome, with the right evidence ids", () => {
    const r = rowsFor(run, "retrieved", byId);
    expect(r).toHaveLength(2);
    expect(r[0].providedIds).toEqual(sample[0].retrievedIds);
    expect(rowsFor(run, "gold", byId)[0].providedIds).toEqual(sample[0].goldIds);
  });

  it("flattens to CSV rows and round-trips through the saved-run schema", () => {
    const flat = runToRows(run, byId);
    expect(flat).toHaveLength(3);
    expect(flat[0]).toMatchObject({ condition: "retrieved", llm_status: "ok", llm_correct: true });
    expect(flat[1]).toMatchObject({ llm_status: "error", llm_correct: null });
    expect(parseRun(JSON.parse(JSON.stringify(run)))).toEqual(run);
    expect(() => parseRun({ ...run, format: "other" })).toThrow();
    expect(flat[0]).toMatchObject({ sample_matches_seed: true });
  });

  it("flags a loaded run whose claims are not the seeded sample", () => {
    expect(sampleMatchesSeed(run, claims)).toBe(true);
    const picked = { ...run, claimIds: [sample[0].id, sample[1].id, claims[0].id] };
    expect(sampleMatchesSeed(picked, claims)).toBe(claims[0].id === sample[2].id);
    expect(sampleMatchesSeed({ ...run, seed: 8 }, claims)).toBe(false);
    expect(sampleMatchesSeed({ ...run, n: 2 }, claims)).toBe(false);
    expect(verifyRun({ ...run, seed: 8 }, byId).sampleMatchesSeed).toBe(false);
  });

  it("re-derives citation checks when a run is loaded", () => {
    const shown = sample[0].retrievedIds[0];
    const edited: HarnessRun = {
      ...run,
      outcomes: {
        ...run.outcomes,
        [sample[0].id]: {
          ...run.outcomes[sample[0].id],
          retrieved: ok(sample[0].label, [shown, "evidence-0"], [shown, "evidence-0"]),
        },
      },
    };
    const checked = verifyRun(edited, byId);
    expect(checked.citationsCorrected).toBe(1);
    const o = checked.run.outcomes[sample[0].id]?.retrieved;
    expect(o?.status === "ok" && o.invalid).toEqual(["evidence-0"]);
    expect(verifyRun(run, byId)).toMatchObject({ citationsCorrected: 0, sampleMatchesSeed: true });
  });
});
