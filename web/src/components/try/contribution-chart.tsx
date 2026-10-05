"use client";

import { useState } from "react";

import { VERDICT_STYLE } from "@/components/common/verdict";
import { LABEL_TEXT, LABELS, type Label } from "@/lib/labels";
import type { CheckResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROWS = 14;

/**
 * Diverging bar chart of each token's exact contribution to one verdict's
 * (centred) logit. Positive bars push towards that verdict, negative away.
 */
export function ContributionChart({ r }: { r: CheckResponse }) {
  const c = r.classification;
  const [label, setLabel] = useState<Label>(c.label);
  const k = LABELS.indexOf(label);
  const padRow = c.contributions.find((x) => x.token === "[PAD]");
  const rows = c.contributions
    .filter((x) => x.token !== "[PAD]")
    .sort((a, b) => Math.abs(b.centred[k]) - Math.abs(a.centred[k]))
    .slice(0, ROWS)
    .sort((a, b) => b.centred[k] - a.centred[k]);
  const max = Math.max(1e-9, ...rows.map((x) => Math.abs(x.centred[k])));
  const wordsTotal = c.contributions
    .filter((x) => x.token !== "[PAD]")
    .reduce((a, x) => a + x.centred[k], 0);
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`;

  return (
    <figure className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption className="max-w-xl space-y-1">
          <p className="font-medium">Which words drove the verdict</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            For a single claim the network is exactly{" "}
            <span className="font-mono">bias + mean of per-token scores</span>, so these bars are
            the true contributions, not an approximation. Each of the 128 positions adds its
            token&rsquo;s score; {c.padding} positions are <span className="font-mono">[PAD]</span>{" "}
            because the input has only {c.inputTokens} tokens
            {c.truncated ? " after truncation" : ""}.
            {c.unknownTokens > 0 &&
              ` ${c.unknownTokens} word${c.unknownTokens === 1 ? " was" : "s were"} not in the training vocabulary and became <unk>.`}
          </p>
        </figcaption>
        <div role="group" aria-label="Explain verdict" className="flex flex-wrap gap-1">
          {LABELS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={label === l}
              onClick={() => setLabel(l)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                label === l
                  ? cn(
                      "border-transparent ring-1 ring-inset",
                      VERDICT_STYLE[l].tint,
                      "text-foreground",
                    )
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {LABEL_TEXT[l].short}
            </button>
          ))}
        </div>
      </div>

      {padRow && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Padding (<span className="font-mono text-foreground">[PAD] ×{padRow.count}</span>) adds{" "}
          <span className="font-mono text-foreground tabular">{signed(padRow.centred[k])}</span> to{" "}
          {LABEL_TEXT[label].short.toLowerCase()}. All the real tokens together add{" "}
          <span className="font-mono text-foreground tabular">{signed(wordsTotal)}</span>.
          {Math.abs(padRow.centred[k]) > Math.abs(wordsTotal) &&
            " For short inputs, how much text there is matters more than which words it contains."}{" "}
          The bars leave padding out so the words stay visible.
        </p>
      )}
      <div className="flex justify-between text-[0.7rem] text-muted-foreground" aria-hidden>
        <span>← away from {LABEL_TEXT[label].short.toLowerCase()}</span>
        <span>towards {LABEL_TEXT[label].short.toLowerCase()} →</span>
      </div>
      <ul className="space-y-1" aria-label={`Token contributions to ${LABEL_TEXT[label].short}`}>
        {rows.map((row) => {
          const v = row.centred[k];
          const w = (Math.abs(v) / max) * 50;
          return (
            <li
              key={row.token}
              className="grid grid-cols-[minmax(5.5rem,8rem)_1fr_3.75rem] items-center gap-2 text-xs"
              title={`${row.token} ×${row.count}: ${v >= 0 ? "+" : ""}${v.toFixed(4)}`}
            >
              <span className="truncate font-mono">
                {row.token}
                {row.count > 1 && <span className="text-muted-foreground"> ×{row.count}</span>}
              </span>
              <span className="relative h-3.5" aria-hidden>
                <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                <span
                  className="absolute inset-y-0.5 rounded-[3px]"
                  style={{
                    left: v >= 0 ? "50%" : `${50 - w}%`,
                    width: `${Math.max(w, 0.4)}%`,
                    background: v >= 0 ? "var(--div-pos)" : "var(--div-neg)",
                  }}
                />
              </span>
              <span className="text-right font-mono tabular">
                {v >= 0 ? "+" : "−"}
                {Math.abs(v).toFixed(3)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[0.7rem] text-muted-foreground">
        Values are logit contributions centred across the four verdicts. Showing the {rows.length}{" "}
        largest of {c.contributions.length - (padRow ? 1 : 0)} distinct tokens other than padding.
      </p>
    </figure>
  );
}
