/**
 * Copy the repository's docs (model card, data statement, decision records) into
 * web/content so the site can render them. The deploy uploads web/ only, so the
 * copies are committed; `src/server/docs.test.ts` fails if they drift from docs/.
 *
 *   pnpm sync:docs
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const docs = fileURLToPath(new URL("../../docs/", import.meta.url));
const out = fileURLToPath(new URL("../content/", import.meta.url));

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}decisions`, { recursive: true });
for (const f of ["model-card.md", "data-statement.md"]) copyFileSync(docs + f, out + f);
const records = readdirSync(`${docs}decisions`).filter((f) => /^DR-\d{3}-.+\.md$/.test(f));
for (const f of records) copyFileSync(`${docs}decisions/${f}`, `${out}decisions/${f}`);
console.log(`synced model-card.md, data-statement.md and ${records.length} decision records`);
