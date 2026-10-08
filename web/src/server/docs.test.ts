import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { decisionSlug, firstTable, headingId, resolveDocHref, splitTitle } from "@/lib/docs";
import { fixed, pct } from "@/lib/format";
import { contentDir, getDecision, getDoc, listDecisions } from "./docs";
import { getBaselineReport } from "./evaluation";

const docsDir = path.join(process.cwd(), "..", "docs");

describe("docs mirrored into web/content", () => {
  it.runIf(existsSync(docsDir))(
    "are identical to the repository's docs/ (run pnpm sync:docs)",
    () => {
      const pairs: [string, string][] = [
        ["model-card.md", "model-card.md"],
        ["data-statement.md", "data-statement.md"],
        ...readdirSync(path.join(docsDir, "decisions"))
          .filter((f) => /^DR-\d{3}-.+\.md$/.test(f))
          .map((f): [string, string] => [`decisions/${f}`, `decisions/${f}`]),
      ];
      for (const [src, copy] of pairs) {
        expect(readFileSync(path.join(contentDir(), copy), "utf8"), copy).toBe(
          readFileSync(path.join(docsDir, src), "utf8"),
        );
      }
      expect(readdirSync(path.join(contentDir(), "decisions")).length).toBe(pairs.length - 2);
    },
  );

  it("parses every decision record in Rin's format", () => {
    const records = listDecisions();
    expect(records.map((r) => r.id)).toEqual(["DR-001", "DR-002", "DR-003", "DR-004"]);
    const sections = [
      "## Context",
      "## Decision",
      "## Options considered",
      "## Why",
      "## What happened",
      "## What I'd change",
    ];
    for (const r of records) {
      expect(r.decision.length, r.id).toBeGreaterThan(20);
      expect(r.status, r.id).not.toBe("");
      expect(r.decided, r.id).not.toBe("");
      // the decision is stated first, before any section
      expect(r.body.indexOf("**Decision:**"), r.id).toBe(0);
      let at = -1;
      for (const s of sections) {
        const i = r.body.indexOf(`\n${s}\n`);
        expect(i, `${r.id} ${s}`).toBeGreaterThan(at);
        at = i;
      }
      expect(r.body).not.toMatch(/ — /);
      expect(getDecision(r.slug)?.id).toBe(r.id);
    }
    expect(getDecision("nope")).toBeUndefined();
  });

  it("keeps the model card's numbers in step with the computed baseline", () => {
    const card = getDoc("model-card");
    expect(card.title).toMatch(/^Model card/);
    const r = getBaselineReport();
    const b = r.protocols.batch;
    const g = r.protocols.gold_evidence;
    const expected = [
      `| ${pct(b.accuracy.estimate)} | ${pct(b.accuracy.lower)} to ${pct(b.accuracy.upper)}`,
      `| ${pct(g.accuracy.estimate)} | ${pct(g.accuracy.lower)} to ${pct(g.accuracy.upper)}`,
      `| ${fixed(b.macroF1.estimate)} | ${fixed(b.macroF1.lower)} to ${fixed(b.macroF1.upper)}`,
      `| ${fixed(r.retrieval.f.estimate)} | ${fixed(r.retrieval.f.lower)} to ${fixed(r.retrieval.f.upper)}`,
      `| ${fixed(r.harmonicMean.estimate)} | ${fixed(r.harmonicMean.lower)} to ${fixed(r.harmonicMean.upper)}`,
    ];
    const squashed = card.body.replace(/ {2,}/g, " ");
    for (const e of expected) expect(squashed).toContain(e);
    expect(getDoc("data-statement").title).toBe("Data statement");
  });
});

describe("doc helpers", () => {
  it("splits titles and reads the first table", () => {
    expect(splitTitle("# Hello\n\nBody")).toEqual({ title: "Hello", body: "Body" });
    expect(splitTitle("No title")).toEqual({ title: "", body: "No title" });
    expect(firstTable("x\n\n| A | B |\n| - | - |\n| 1 | two |\n")).toEqual({ A: "1", B: "two" });
    expect(firstTable("no table")).toEqual({});
  });

  it("maps GitHub-relative links onto site routes", () => {
    expect(resolveDocHref("data-statement.md")).toBe("/methods/data-statement");
    expect(resolveDocHref("../model-card.md#evaluation")).toBe("/methods/model-card#evaluation");
    expect(resolveDocHref("decisions/DR-004-byok-browser-only-llm-evaluation.md")).toBe(
      "/methods/decisions/dr-004-byok-browser-only-llm-evaluation",
    );
    expect(resolveDocHref("https://example.org/x.md")).toBe("https://example.org/x.md");
    expect(resolveDocHref("/methods")).toBe("/methods");
    expect(resolveDocHref("other.txt")).toBe("other.txt");
    expect(decisionSlug("DR-002-x.md")).toBe("dr-002-x");
    expect(headingId("What I'd change")).toBe("what-id-change");
  });
});
