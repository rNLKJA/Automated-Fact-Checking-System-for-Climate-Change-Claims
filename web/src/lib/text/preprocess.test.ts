import { describe, expect, it } from "vitest";

import porterFixture from "../__fixtures__/porter.json";
import preprocessFixture from "../__fixtures__/preprocess.json";
import { claimTagsOf } from "../retrieval";
import { fixContractions } from "./contractions";
import { porterStem } from "./porter";
import { preprocessAndTokenize, preprocessTrace } from "./preprocess";
import { pyIsAlpha, pySplit, pyTitle, splitAndStripPunctuation } from "./pystr";
import { treebankTokenize, wordTokenize } from "./tokenize";

describe("python string helpers", () => {
  it("split() splits on any whitespace run and drops empties", () => {
    expect(pySplit("  a\tb\n\nc  ")).toEqual(["a", "b", "c"]);
    expect(pySplit("")).toEqual([]);
  });

  it("isalpha() follows Unicode letter categories", () => {
    expect(pyIsAlpha("climate")).toBe(true);
    expect(pyIsAlpha("zürich")).toBe(true);
    expect(pyIsAlpha("全球")).toBe(true);
    expect(pyIsAlpha("co2")).toBe(false);
    expect(pyIsAlpha("")).toBe(false);
  });

  it("title() capitalises after every uncased character", () => {
    expect(pyTitle("they're here")).toBe("They'Re Here");
  });

  it("turns every ASCII punctuation mark into two spaces", () => {
    expect(splitAndStripPunctuation("sentence.abc")).toBe("sentence  abc");
  });
});

describe("contractions.fix", () => {
  it("expands common contractions and keeps the original case", () => {
    expect(fixContractions("I can't go")).toBe("I cannot go");
    expect(fixContractions("DON'T")).toBe("DO NOT");
    expect(fixContractions("Don't")).toBe("Do not");
  });

  it("leaves words untouched when the match is inside a larger word", () => {
    expect(fixContractions("cantilever")).toBe("cantilever");
  });
});

describe("word_tokenize", () => {
  it("splits Treebank-style contractions and quotes", () => {
    expect(treebankTokenize("“Hello” cannot gonna")).toEqual([
      "“",
      "Hello",
      "”",
      "can",
      "not",
      "gon",
      "na",
    ]);
  });

  it("refuses inputs that would need Punkt sentence splitting", () => {
    expect(() => wordTokenize("one. two")).toThrow();
  });
});

describe("parity with NLTK PorterStemmer (Python ground truth)", () => {
  const pairs = Object.entries(porterFixture as Record<string, string>);

  it(`stems all ${pairs.length} words like NLTK 3.8.1`, () => {
    const mismatches = pairs.filter(([w, s]) => porterStem(w) !== s);
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(pairs.length).toBeGreaterThan(5000);
  });
});

describe("parity with preprocess_and_tokenize (Python ground truth)", () => {
  const cases = preprocessFixture as { text: string; stems: string[] }[];

  it(`reproduces all ${cases.length} texts (claims, passages, edge cases)`, () => {
    const mismatches = cases
      .map((c) => ({ text: c.text, expected: c.stems, got: preprocessAndTokenize(c.text) }))
      .filter((c) => JSON.stringify(c.got) !== JSON.stringify(c.expected));
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(cases.length).toBeGreaterThan(700);
  });

  it("matches the claim tags printed by notebook cells 10 and 25", () => {
    expect(
      claimTagsOf(
        "[South Australia] has the most expensive electricity in the world.",
        preprocessAndTokenize,
      ),
    ).toBe("australia electr expens south world");
  });

  it("exposes every intermediate stage", () => {
    const t = preprocessTrace("It's the Sun's fault!");
    expect(t.expanded).toBe("It is the Sun's fault!");
    expect(t.kept).toEqual(["sun", "fault"]);
    expect(t.stems).toEqual(["sun", "fault"]);
  });
});
