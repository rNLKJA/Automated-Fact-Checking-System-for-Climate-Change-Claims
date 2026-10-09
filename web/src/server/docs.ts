import "server-only";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseDecisionRecord, splitTitle, type DecisionRecord } from "@/lib/docs";

/**
 * The markdown documents under web/content (copied from the repository's docs/
 * by `pnpm sync:docs`). Read at build time: every page that uses them is static.
 */
export function contentDir(): string {
  return path.join(process.cwd(), "content");
}

export function listDecisions(): DecisionRecord[] {
  const dir = path.join(contentDir(), "decisions");
  return readdirSync(dir)
    .filter((f) => /^DR-\d{3}-.+\.md$/.test(f))
    .sort()
    .map((f) => parseDecisionRecord(f, readFileSync(path.join(dir, f), "utf8")));
}

export function getDecision(slug: string): DecisionRecord | undefined {
  return listDecisions().find((d) => d.slug === slug);
}

export type DocName = "model-card" | "data-statement";

export function getDoc(name: DocName): { title: string; body: string } {
  return splitTitle(readFileSync(path.join(contentDir(), `${name}.md`), "utf8"));
}
