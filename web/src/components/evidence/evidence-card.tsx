import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { evidenceNumber, fixed } from "@/lib/format";
import { pySplit } from "@/lib/text/pystr";
import { cn } from "@/lib/utils";
import { TagChips } from "./tag-chips";

export type Scores = { sim: number; overlap: number; combined: number; maxMatch: number };

export function ScoreRow({ scores }: { scores: Scores }) {
  const items: [string, string, string][] = [
    ["cos", fixed(scores.sim), "Cosine similarity of the tag TF-IDF vectors"],
    ["overlap", fixed(scores.overlap), "Shared tags ÷ size of the smaller tag set"],
    ["score", fixed(scores.combined), "Combined score used for ranking"],
    ["shared", String(scores.maxMatch), "Number of tags shared with the claim"],
  ];
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([k, v, title]) => (
        <div key={k} className="flex items-baseline gap-1" title={title}>
          <dt>{k}</dt>
          <dd className="font-mono text-foreground tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EvidenceCard({
  id,
  text,
  tags,
  claimTags,
  rank,
  scores,
  isGold,
  footer,
  className,
}: {
  id: string;
  text: string;
  tags: string | null;
  claimTags?: ReadonlySet<string>;
  rank?: number;
  scores?: Scores;
  isGold?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "relative space-y-3 rounded-xl border bg-card p-4",
        isGold ? "border-hit/50 shadow-[inset_3px_0_0_var(--hit)]" : "border-border",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {rank !== undefined && <span className="font-mono tabular">#{rank + 1}</span>}
        <span className="font-mono">evidence-{evidenceNumber(id)}</span>
        {isGold && (
          <span className="inline-flex items-center gap-1 rounded-full bg-hit/12 px-2 py-0.5 font-medium text-foreground ring-1 ring-hit/40 ring-inset">
            <Check aria-hidden className="size-3 text-hit" /> gold evidence
          </span>
        )}
      </header>
      <p className="font-serif text-[1.05rem] leading-relaxed">{text}</p>
      {tags !== null && <TagChips tags={pySplit(tags)} matched={claimTags} label="Evidence tags" />}
      {scores && <ScoreRow scores={scores} />}
      {footer}
    </article>
  );
}
