/**
 * Parsing for the markdown documents the site renders under /methods
 * (decision records, the model card and the data statement). Pure functions;
 * the file reading lives in `src/server/docs.ts`.
 */

export type DecisionRecord = {
  /** "dr-001-tfidf-retrieval-over-dense-retrieval" */
  slug: string;
  /** "DR-001-tfidf-retrieval-over-dense-retrieval.md" */
  file: string;
  /** "DR-001" */
  id: string;
  title: string;
  /** the one-line decision stated at the top */
  decision: string;
  status: string;
  decided: string;
  /** markdown after the H1 */
  body: string;
};

/** "DR-001-foo-bar.md" -> "dr-001-foo-bar" */
export function decisionSlug(file: string): string {
  return file.replace(/\.md$/, "").toLowerCase();
}

/** Split off the first-level heading. */
export function splitTitle(markdown: string): { title: string; body: string } {
  const m = /^#\s+(.+)\r?\n/.exec(markdown);
  if (!m) return { title: "", body: markdown };
  return { title: m[1].trim(), body: markdown.slice(m[0].length).replace(/^\s+/, "") };
}

function stripMarkdown(s: string): string {
  return s.replace(/\*\*|`/g, "").trim();
}

/** The first markdown table's header row mapped onto its first data row. */
export function firstTable(markdown: string): Record<string, string> {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith("|"));
  if (start < 0 || start + 2 >= lines.length) return {};
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(lines[start]);
  const row = cells(lines[start + 2]);
  return Object.fromEntries(head.map((h, i) => [h, row[i] ?? ""]));
}

export function parseDecisionRecord(file: string, markdown: string): DecisionRecord {
  const { title: h1, body } = splitTitle(markdown);
  const m = /^(DR-\d{3}):\s*(.+)$/.exec(h1);
  if (!m) throw new Error(`${file}: the title must read "DR-00N: ..."`);
  const decisionLine = /^\*\*Decision:\*\*\s*(.+)$/m.exec(body);
  if (!decisionLine) throw new Error(`${file}: the decision must be stated first`);
  const meta = firstTable(body);
  return {
    slug: decisionSlug(file),
    file,
    id: m[1],
    title: m[2].trim(),
    decision: stripMarkdown(decisionLine[1]),
    status: meta.Status ?? "",
    decided: meta.Decided ?? "",
    body,
  };
}

/**
 * Map a link written for GitHub (relative .md paths) onto the site's routes.
 * External and absolute links are returned unchanged.
 */
export function resolveDocHref(href: string): string {
  if (/^[a-z]+:/i.test(href) || href.startsWith("/") || href.startsWith("#")) return href;
  const [path, hash] = href.split("#");
  const file = path.split("/").pop() ?? "";
  const anchor = hash ? `#${hash}` : "";
  if (file === "model-card.md") return `/methods/model-card${anchor}`;
  if (file === "data-statement.md") return `/methods/data-statement${anchor}`;
  if (/^DR-\d{3}-.+\.md$/.test(file)) return `/methods/decisions/${decisionSlug(file)}${anchor}`;
  if (file === "README.md" && path.includes("decisions")) return "/methods#decisions";
  return href;
}

/** Heading text -> anchor id ("What I'd change" -> "what-id-change"). */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
