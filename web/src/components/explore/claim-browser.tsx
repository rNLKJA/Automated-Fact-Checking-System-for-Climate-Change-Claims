"use client";

import { Check, RotateCcw, Search, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { VERDICT_STYLE, VerdictBadge } from "@/components/common/verdict";
import { Button } from "@/components/ui/button";
import { claimNumber, fixed } from "@/lib/format";
import { LABEL_TEXT, LABELS, type Label } from "@/lib/labels";
import type { ClaimSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE = 40;

type Outcome = "all" | "correct" | "wrong";
type Evidence = "all" | "hit" | "miss";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{label}</legend>
      <span aria-hidden className="text-xs text-muted-foreground">
        {label}
      </span>
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "cursor-pointer rounded-md px-2.5 py-1 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
              value === o.value
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={label}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ClaimBrowser({ claims }: { claims: ClaimSummary[] }) {
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState<Set<Label>>(new Set());
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [evidence, setEvidence] = useState<Evidence>("all");
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(query.trim().toLowerCase());

  const visible = useMemo(
    () =>
      claims.filter(
        (c) =>
          (q === "" || c.text.toLowerCase().includes(q) || c.id.includes(q)) &&
          (labels.size === 0 || labels.has(c.label)) &&
          (outcome === "all" || (outcome === "correct") === (c.label === c.predicted)) &&
          (evidence === "all" || (evidence === "hit") === c.nCorrect > 0),
      ),
    [claims, q, labels, outcome, evidence],
  );

  const filtered = query !== "" || labels.size > 0 || outcome !== "all" || evidence !== "all";
  const reset = () => {
    setQuery("");
    setLabels(new Set());
    setOutcome("all");
    setEvidence("all");
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search claims</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search claim text or id, e.g. sea level, CO2, claim-752"
              className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm placeholder:text-muted-foreground"
            />
          </label>
          <p className="text-sm text-muted-foreground tabular" aria-live="polite">
            {visible.length} of {claims.length} claims
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Gold label</span>
          {LABELS.map((l) => {
            const on = labels.has(l);
            const Icon = VERDICT_STYLE[l].icon;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setLabels((prev) => {
                    const next = new Set(prev);
                    if (next.has(l)) next.delete(l);
                    else next.add(l);
                    return next;
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors",
                  on
                    ? cn("border-transparent ring-1 ring-inset", VERDICT_STYLE[l].tint)
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden className={cn("size-3.5", VERDICT_STYLE[l].color)} />
                {LABEL_TEXT[l].short}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Segmented
            label="Verdict"
            value={outcome}
            onChange={setOutcome}
            options={[
              { value: "all", label: "All" },
              { value: "correct", label: "Correct" },
              { value: "wrong", label: "Wrong" },
            ]}
          />
          <Segmented
            label="Evidence"
            value={evidence}
            onChange={setEvidence}
            options={[
              { value: "all", label: "All" },
              { value: "hit", label: "Found gold" },
              { value: "miss", label: "Missed" },
            ]}
          />
          {filtered && (
            <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">
              <RotateCcw aria-hidden /> Reset filters
            </Button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="font-serif text-xl">No claims match these filters.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Only 13 dev claims had any gold passage retrieved, so combining narrow filters empties
            the list quickly.
          </p>
          <Button variant="outline" size="sm" onClick={reset} className="mt-4">
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {visible.slice(0, limit).map((c) => (
              <ClaimRowItem key={c.id} claim={c} />
            ))}
          </ol>
          {visible.length > limit && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, visible.length - limit)} more ({visible.length - limit} hidden)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClaimRowItem({ claim: c }: { claim: ClaimSummary }) {
  const correct = c.label === c.predicted;
  return (
    <li>
      <Link
        href={`/explore/${c.id}`}
        className="group grid gap-3 p-4 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 sm:grid-cols-[3.5rem_1fr_auto] sm:items-center sm:gap-5 sm:px-5"
      >
        <span className="font-mono text-xs text-muted-foreground tabular">
          #{claimNumber(c.id)}
        </span>
        <span className="line-clamp-2 font-serif text-[1.05rem] leading-snug group-hover:underline group-hover:decoration-border group-hover:underline-offset-4">
          {c.text}
        </span>
        <span className="flex flex-wrap items-center gap-2 sm:justify-end">
          <VerdictBadge label={c.label} size="sm" />
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
              correct ? "bg-hit/12 text-foreground" : "bg-muted text-muted-foreground",
            )}
            title={`Model predicted ${LABEL_TEXT[c.predicted].short}`}
          >
            {correct ? (
              <Check aria-hidden className="size-3 text-hit" />
            ) : (
              <X aria-hidden className="size-3" />
            )}
            {correct ? "model agrees" : `model: ${LABEL_TEXT[c.predicted].short.toLowerCase()}`}
          </span>
          <span
            className="min-w-[6.5rem] text-right font-mono text-xs text-muted-foreground tabular"
            title={`${c.nCorrect} of ${c.nGold} gold passages retrieved; evidence F ${fixed(c.f)}`}
          >
            {c.nCorrect}/{c.nGold} gold · F {fixed(c.f, 2)}
          </span>
        </span>
      </Link>
    </li>
  );
}
