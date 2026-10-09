import {
  HARNESS_DEFAULTS,
  sampleClaims,
  type Condition,
  type HarnessClaim,
  type HarnessRun,
  type LlmOutcome,
} from "../../src/lib/evaluation/harness";
import { LABELS, type Label } from "../../src/lib/labels";
import { mulberry32 } from "../../src/lib/stats/random";

/**
 * A MOCKED LLM run for the showcase recording. No model is called and no API
 * key is used: the verdicts below are drawn from a seeded random generator so
 * the evaluation page has something to score. They say nothing about how any
 * real model performs. The provider and model ids, every rationale and the
 * tour's captions all say so.
 */
export const MOCK_PROVIDER = "mock";
export const MOCK_MODEL = "mocked-llm-for-illustration";
export const MOCK_SEED = 7;
const RATIONALE = "Mocked response for illustration: no model was called.";

/** How often the mock returns the gold label, per evidence condition. */
const HIT_RATE: Record<Condition, number> = { retrieved: 0.5, gold: 0.8 };

function otherLabel(gold: Label, r: number): Label {
  const others = LABELS.filter((l) => l !== gold);
  return others[Math.floor(r * others.length)] ?? "NOT_ENOUGH_INFO";
}

export function buildMockRun(claims: readonly HarnessClaim[]): HarnessRun {
  const rng = mulberry32(MOCK_SEED);
  const { n, seed } = HARNESS_DEFAULTS;
  const sample = sampleClaims(claims, n, seed);
  const conditions: Condition[] = ["retrieved", "gold"];
  const outcomes: HarnessRun["outcomes"] = {};
  sample.forEach((c, i) => {
    const byCondition: Partial<Record<Condition, LlmOutcome>> = {};
    for (const cond of conditions) {
      const shown = cond === "retrieved" ? c.retrieved : c.gold;
      // on retrieved evidence a careful model often says "not enough info"
      const hit = rng() < HIT_RATE[cond];
      const label: Label = hit
        ? c.label
        : cond === "retrieved" && rng() < 0.6
          ? "NOT_ENOUGH_INFO"
          : otherLabel(c.label, rng());
      const cited = shown.slice(0, Math.max(1, Math.min(2, shown.length))).map((p) => p.id);
      byCondition[cond] = {
        status: "ok",
        label,
        cited,
        valid: cited,
        invalid: [],
        rationale: RATIONALE,
        latencyMs: Math.round(650 + rng() * 900),
        inputTokens: null,
        outputTokens: null,
        auditId: `mock-${String(i + 1).padStart(2, "0")}-${cond}`,
      };
    }
    outcomes[c.id] = byCondition;
  });
  return {
    format: "climate-claim-checker/llm-eval",
    version: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    provider: MOCK_PROVIDER,
    model: MOCK_MODEL,
    n: sample.length,
    seed,
    conditions,
    claimIds: sample.map((c) => c.id),
    outcomes,
  };
}
