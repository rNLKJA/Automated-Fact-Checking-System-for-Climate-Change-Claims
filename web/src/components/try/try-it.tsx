"use client";

import { ArrowRight, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { ProbabilityBars, VerdictBadge } from "@/components/common/verdict";
import { EvidenceCard } from "@/components/evidence/evidence-card";
import { TagChips } from "@/components/evidence/tag-chips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fixed, int, pct } from "@/lib/format";
import { LABEL_TEXT, LABELS } from "@/lib/labels";
import type { RuleId } from "@/lib/retrieval";
import type { CheckResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContributionChart } from "./contribution-chart";

const EXAMPLES = [
  { text: "Arctic sea ice has been shrinking for decades.", note: "finds a gold passage" },
  { text: "Antarctica is gaining ice, not losing it.", note: "finds a gold passage" },
  { text: "Carbon dioxide is a trace gas, so it cannot warm the planet.", note: "on topic" },
  {
    text: "[South Australia] has the most expensive electricity in the world.",
    note: "a dev claim",
  },
  { text: "Wind turbines kill millions of birds every year.", note: "fallback path" },
  { text: "The Great Barrier Reef is in better shape than ever.", note: "a telling miss" },
];

type State =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; result: CheckResponse };

export function TryIt({
  initialClaim,
  devAccuracy,
  baseline,
  indexSize,
}: {
  initialClaim?: string;
  devAccuracy: number;
  baseline: number;
  indexSize: number;
}) {
  const [claim, setClaim] = useState(initialClaim ?? "");
  const [rule, setRule] = useState<RuleId>("submission");
  const [state, setState] = useState<State>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  const run = useCallback((text: string, which: RuleId, reveal = false) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claim: text, rule: which }),
        });
        const json = (await res.json()) as CheckResponse | { error: string };
        if (!res.ok || "error" in json) {
          setState({
            status: "error",
            message: "error" in json ? json.error : `Request failed (${res.status}).`,
          });
        } else {
          setState({ status: "done", result: json });
          requestAnimationFrame(() => {
            const el = resultRef.current;
            if (!el) return;
            el.focus({ preventScroll: true });
            // on one-column layouts the result sits below the form and examples
            if (reveal && window.matchMedia("(max-width: 1023px)").matches) {
              const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
            }
          });
        }
      } catch {
        setState({
          status: "error",
          message: "Could not reach the server. Check your connection and try again.",
        });
      }
    });
  }, []);

  useEffect(() => {
    if (initialClaim && !ran.current) {
      ran.current = true;
      run(initialClaim, "submission");
    }
  }, [initialClaim, run]);

  const submit = (text = claim, which = rule) => {
    if (text.trim().length < 3) {
      setState({ status: "error", message: "Type a claim of at least a few words." });
      return;
    }
    run(text, which, true);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <form
        className="space-y-5 lg:sticky lg:top-20"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="space-y-2">
          <label htmlFor="claim" className="font-serif text-xl font-medium">
            Your claim
          </label>
          <Textarea
            id="claim"
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={600}
            rows={4}
            placeholder="e.g. Sea levels are rising faster than ever."
            className="min-h-28 resize-y bg-card font-serif text-lg leading-snug"
            aria-describedby="claim-help"
          />
          <p id="claim-help" className="text-xs text-muted-foreground">
            One sentence works best. Press <kbd className="font-mono">⌘/Ctrl + Enter</kbd> to check.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Scoring rule</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
            {(
              [
                ["submission", "Submitted", "sim + overlap"],
                ["notebook", "Notebook", "sim + overlap + sim"],
              ] as const
            ).map(([value, label, formula]) => (
              <label
                key={value}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-2 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
                  rule === value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="rule"
                  value={value}
                  checked={rule === value}
                  onChange={() => setRule(value)}
                  className="sr-only"
                />
                <span className="block font-medium">{label}</span>
                <span className="block font-mono text-[0.7rem]">{formula}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle aria-hidden className="animate-spin" /> Checking…
            </>
          ) : (
            <>
              Check this claim <ArrowRight aria-hidden />
            </>
          )}
        </Button>

        <div className="space-y-2">
          <p className="text-sm font-medium">Or start from an example</p>
          <ul className="space-y-1.5">
            {EXAMPLES.map((ex) => (
              <li key={ex.text}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setClaim(ex.text);
                    submit(ex.text, rule);
                  }}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-foreground/30 hover:bg-accent/40 disabled:opacity-60"
                >
                  <span className="block leading-snug">{ex.text}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{ex.note}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </form>

      <div
        ref={resultRef}
        tabIndex={-1}
        className="min-w-0 scroll-mt-20 outline-none"
        aria-live="polite"
        aria-busy={pending}
      >
        {pending ? (
          <ResultSkeleton />
        ) : state.status === "error" ? (
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/8 p-5"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">That didn&rsquo;t work</p>
              <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
            </div>
          </div>
        ) : state.status === "done" ? (
          <Result r={state.result} devAccuracy={devAccuracy} baseline={baseline} />
        ) : (
          <EmptyState indexSize={indexSize} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ indexSize }: { indexSize: number }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 sm:p-10">
      <p className="font-serif text-2xl font-medium">What happens when you press check</p>
      <ol className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">1. Preprocess.</span> Your sentence goes
          through the notebook&rsquo;s exact cleaning: contractions expanded, punctuation stripped,
          stopwords dropped, Porter stems.
        </li>
        <li>
          <span className="font-medium text-foreground">2. Retrieve.</span> Its stems are compared
          with the tags of {int(indexSize)} Wikipedia passages: every gold passage in the dataset,
          every passage the 2024 system retrieved for a dev or test claim, and a random sample of
          the full 1.2M.
        </li>
        <li>
          <span className="font-medium text-foreground">3. Classify.</span> The retrained
          Transformer reads your stems plus the evidence stems and returns a verdict, with every
          word&rsquo;s exact contribution.
        </li>
      </ol>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-6" aria-label="Checking the claim">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}

function Result({
  r,
  devAccuracy,
  baseline,
}: {
  r: CheckResponse;
  devAccuracy: number;
  baseline: number;
}) {
  const c = r.classification;
  const claimTags = new Set(r.claimTags.split(" "));
  const k = LABELS.indexOf(c.label);
  return (
    <div className="space-y-10">
      <section
        aria-labelledby="verdict-h"
        className="rounded-2xl border border-border bg-card p-6 sm:p-7"
      >
        <p className="text-sm text-muted-foreground" id="verdict-h">
          The 2024 model&rsquo;s verdict
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <VerdictBadge label={c.label} size="lg" />
          <span className="text-sm text-muted-foreground tabular">
            {pct(c.probs[k])} confidence
          </span>
        </div>
        <ProbabilityBars probs={c.probs} highlight={c.label} className="mt-6" />
        <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          Treat this as a museum piece, not a fact-checker. On the 154 dev claims this model is
          right {pct(devAccuracy, 0)} of the time, below the {pct(baseline, 0)} you&rsquo;d get by
          always answering &ldquo;supports&rdquo;. It never predicts{" "}
          {LABEL_TEXT.REFUTES.short.toLowerCase()} or {LABEL_TEXT.DISPUTED.short.toLowerCase()}.
        </p>
      </section>

      <section aria-labelledby="evidence-h" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="evidence-h" className="text-2xl font-medium">
            Evidence it retrieved
          </h2>
          <p className="text-xs text-muted-foreground tabular">
            {r.retrieval.path === "filtered"
              ? `${r.retrieval.nFiltered} of ${int(r.retrieval.indexSize)} passages passed the thresholds; ${r.retrieval.passages.length} shared the most tags`
              : `none of ${int(r.retrieval.indexSize)} passages passed; showing the top ${r.retrieval.passages.length} by score`}{" "}
            · {r.retrieval.tookMs.toFixed(0)} ms
          </p>
        </div>
        {r.retrieval.path === "fallback" && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Fallback path: nothing had cosine &gt; 0.55 and tag overlap &gt; 0.5, so the passages
            with the highest combined score were used anyway. This happened for 47% of the dev
            claims.
          </p>
        )}
        <ol className="space-y-3">
          {r.retrieval.passages.map((p, i) => (
            <li key={p.id}>
              <EvidenceCard
                id={p.id}
                text={p.text}
                tags={p.tags}
                claimTags={claimTags}
                rank={i}
                scores={p}
                footer={
                  p.goldFor.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Gold evidence for{" "}
                      {p.goldFor.map((g, j) => (
                        <span key={g.id}>
                          {j > 0 && ", "}
                          <GoldLink id={g.id} split={g.split} />
                        </span>
                      ))}
                    </p>
                  ) : null
                }
              />
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="hood-h" className="space-y-6">
        <h2 id="hood-h" className="text-2xl font-medium">
          Under the hood
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border bg-card p-5">
            <p className="font-medium">Preprocessing</p>
            <p className="text-xs text-muted-foreground">
              Tokens after cleaning; struck-through ones are stopwords or non-alphabetic.
            </p>
            <p className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-sm">
              {r.trace.tokens.map((t, i) => {
                const dropped = !r.trace.kept.includes(t);
                return (
                  <span
                    key={`${t}-${i}`}
                    className={dropped ? "text-muted-foreground/70 line-through" : undefined}
                  >
                    {t}
                  </span>
                );
              })}
            </p>
            <p className="text-xs text-muted-foreground">Claim tags (sorted Porter stems)</p>
            <TagChips tags={r.claimTags.split(" ")} label="Claim tags" />
          </div>
          <div className="space-y-3 rounded-xl border border-border bg-card p-5">
            <p className="font-medium">Tag TF-IDF vector</p>
            <p className="text-xs text-muted-foreground">
              Only stems inside the 1,000-term vocabulary count for cosine similarity. Others still
              count for tag overlap.
            </p>
            {r.tagTerms.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None of the stems is in the vocabulary, so every cosine is 0.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {r.tagTerms.map((t) => (
                  <li
                    key={t.term}
                    className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-sm"
                  >
                    <span className="truncate font-mono">{t.term}</span>
                    <span className="h-1.5 rounded-full bg-muted" aria-hidden>
                      <span
                        className="block h-full rounded-full bg-series-1"
                        style={{ width: `${t.weight * 100}%` }}
                      />
                    </span>
                    <span className="text-right font-mono text-xs tabular">
                      {fixed(t.weight, 2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <ContributionChart r={r} />
      </section>
    </div>
  );
}

function GoldLink({ id, split }: { id: string; split: string }) {
  // dev claims have pages; train claims do not
  return split === "dev" ? (
    <Link
      href={`/explore/${id}`}
      className="font-mono text-foreground underline-offset-4 hover:underline"
      prefetch={false}
    >
      {id}
    </Link>
  ) : (
    <span className="font-mono">
      {id} <span className="font-sans">(train)</span>
    </span>
  );
}
