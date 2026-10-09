import { describe, expect, it } from "vitest";

import { fileSafe, pp, pValue, range, signed } from "./format";

describe("number formatting for intervals and tests", () => {
  it("formats signed percentage points with a true minus sign", () => {
    expect(pp(0.058441)).toBe("+5.8 pp");
    expect(pp(-0.058441)).toBe("−5.8 pp");
    expect(pp(0.0001)).toBe("0.0 pp");
    expect(pp(Number.NaN)).toBe("–");
    expect(signed(-0.1188, 2)).toBe("−0.12");
    expect(signed(0.0004, 3)).toBe("0.000");
    expect(signed(null)).toBe("–");
  });

  it("formats p-values conventionally", () => {
    expect(pValue(0.2220528)).toBe("0.22");
    expect(pValue(0.0049)).toBe("0.005");
    expect(pValue(3.6e-5)).toBe("< 0.001");
    expect(pValue(1)).toBe("1.00");
    expect(pValue(undefined)).toBe("–");
  });

  it("formats intervals", () => {
    expect(range(0.31, 0.4619)).toBe("[31.0%, 46.2%]");
    expect(range(0.0204, 0.0695, "fixed")).toBe("[0.020, 0.070]");
    expect(range(-0.1428, 0.026, "pp")).toBe("[−14.3 pp, +2.6 pp]");
    expect(range(0.0169, 0.105, "signed")).toBe("[+0.017, +0.105]");
  });
});

describe("file names", () => {
  it("makes free-text model ids safe for downloads", () => {
    expect(fileSafe("claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(fileSafe("org/model:v1.2")).toBe("org-model-v1.2");
    expect(fileSafe("../../etc")).toBe("etc");
    expect(fileSafe("///")).toBe("model");
    expect(fileSafe("x".repeat(200))).toHaveLength(80);
  });
});
