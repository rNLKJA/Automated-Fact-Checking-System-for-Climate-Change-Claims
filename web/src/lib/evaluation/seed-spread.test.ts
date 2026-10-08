import { describe, expect, it } from "vitest";

import { baselineRows, getSeedSpread, seedSpreadFile } from "@/server/evaluation";
import { spread, summarizeSeedSpread } from "./seed-spread";

describe("training-seed spread", () => {
  const file = seedSpreadFile();
  const s = getSeedSpread();
  const rows = baselineRows();

  it("covers five seeds for both models on all 154 dev claims, in dev order", () => {
    expect(file.seeds).toEqual([42, 1, 2, 3, 4]);
    expect(file.claim_ids).toEqual(rows.map((r) => r.id));
    for (const kind of ["transformer", "lstm"] as const) {
      expect(file.runs[kind].map((r) => r.seed)).toEqual(file.seeds);
      for (const r of file.runs[kind]) {
        expect(r.predictions_retrieved).toHaveLength(154);
        expect(r.predictions_gold).toHaveLength(154);
        // the training loop's best validation accuracy is accuracy on gold evidence
        const run = s.models[kind].runs.find((x) => x.seed === r.seed);
        expect(run?.goldAccuracy).toBeCloseTo(r.best_val_acc, 12);
      }
    }
  });

  it("reproduces the site's seed-42 model exactly", () => {
    const seed42 = file.runs.transformer.find((r) => r.seed === 42);
    expect(seed42?.predictions_retrieved).toEqual(rows.map((r) => r.predictions.batch));
    expect(seed42?.predictions_gold).toEqual(rows.map((r) => r.predictions.gold_evidence));
  });

  it("supports the claims the site makes about it", () => {
    const majority = rows.filter((r) => r.label === "SUPPORTS").length / rows.length;
    for (const kind of ["transformer", "lstm"] as const) {
      for (const r of s.models[kind].runs) {
        // no retrain beats always answering "supports" on retrieved evidence ...
        expect(r.retrievedAccuracy).toBeLessThan(majority);
        // ... and none ever predicts refuted or disputed
        expect(r.labelsUsed).toEqual(["SUPPORTS", "NOT_ENOUGH_INFO"]);
      }
    }
    expect(s.models.transformer.retrieved.min).toBeCloseTo(57 / 154, 12);
    expect(s.models.transformer.retrieved.max).toBeCloseTo(66 / 154, 12);
    expect(s.goldGap).toHaveLength(5);
  });

  it("summarises a spread", () => {
    expect(spread([1, 2, 3])).toEqual({ min: 1, max: 3, mean: 2, sd: 1 });
    expect(spread([4]).sd).toBe(0);
    expect(() => summarizeSeedSpread(file, new Map())).toThrow(/no gold label/);
  });
});
