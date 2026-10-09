"use client";

import { ArrowRight, Info, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { SecondOpinion } from "@/components/ai/second-opinion";
import { ProbabilityBars, VerdictBadge } from "@/components/common/verdict";
import { EvidenceCard } from "@/components/evidence/evidence-card";
import { TagChips } from "@/components/evidence/tag-chips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fixed, int, pct, pp } from "@/lib/format";
import { LABEL_TEXT, LABELS } from "@/lib/labels";
import type { RuleId } from "@/lib/retrieval";
import type { CheckResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContributionChart } from "./contribution-chart";

/** One-click examples; each note was checked against the full-corpus run at build time. */
export type Example = { text: string; note: string };

/** Agreement of the pruned index with the full corpus on held-out free-text claims. */
export type SubsetAgreement = {
  claims: number;
  agree: number;
  byPath: Record<"filtered" | "fallback", [agree: number, total: number]>;
};

/** The one-claim-at-a-time protocol's dev accuracy (Wilson interval). */
type DevAccuracy = { estimate: number; lower: number; upper: number; successes: number; n: number };
/** Its paired difference from always answering "supports" (bootstrap interval). */
type Gap = { estimate: number; lower: number; upper: number };

type State =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; result: CheckResponse };

export function TryIt({
  initialClaim,
  examples,
  agreement,
  devAccuracy,
  baseline,
  gap,
  indexSize,
}: {
  initialClaim?: string;
  examples: readonly Example[];
  agreement: Record<RuleId, SubsetAgreement>;
  devAccuracy: DevAccuracy;
  baseline: number;
  gap: Gap;
  indexSize: number;
}) {
  const [claim, setClaim] = useState(initialClaim ?? "");
  const [rule, setRule] = useState<RuleId>("submission");
  const [state, setState] = useState<State>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  /** Focus a fresh verdict; on one-column layouts it sits below the examples, so scroll to it. */
  const reveal = useCallback(() => {
    requestAnimationFrame(() => {
      const el = resultRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 1023px)").matches) {
        const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      }
    });
  }, []);

  const run = useCallback(
    (text: string, which: RuleId) => {
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
            reveal();
          }
        } catch {
          setState({
            status: "error",
            message: "Could not reach the server. Check your connection and try again.",
          });
        }
      });
    },
    [reveal],
  );

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
    run(text, which);
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

        {/* one-column layouts: show errors next to the input, not below the examples */}
        {!pending && state.status === "error" && (
          <ErrorAlert message={state.message} className="lg:hidden" />
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Or start from an example</p>
          <ul className="space-y-1.5">
            {examples.map((ex) => (
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
          <ErrorAlert message={state.message} className="hidden lg:flex" />
        ) : state.status === "done" ? (
          <Result
            r={state.result}
            agreement={agreement[state.result.rule]}
            devAccuracy={devAccuracy}
            baseline={baseline}
            gap={gap}
          />
        ) : (
          <EmptyState indexSize={indexSize} />
        )}
      </div>
    </div>
  );
}

/** Rendered in one of two places by breakpoint; the hidden copy is display:none, so only one is announced. */
function ErrorAlert({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-xl border border-destructive/40 bg-destructive/8 p-5",
        className,
      )}
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div>
        <p className="font-medium">That didn&rsquo;t work</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
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
          with the tags of {int(indexSize)} Wikipedia passages: every gold passage for the train and
          dev claims, every passage the 2024 rule could select for any of the 1,535 dataset claims
          or the examples, and a random sample of the full 1.2M. For any other sentence the full
          2024 search may pick passages that are not in this subset.
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
  agreement,
  devAccuracy,
  baseline,
  gap,
}: {
  r: CheckResponse;
  agreement: SubsetAgreement;
  devAccuracy: DevAccuracy;
  baseline: number;
  gap: Gap;
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
          Treat this as a museum piece, not a fact-checker. Run one claim at a time, as here, it is
          right on {devAccuracy.successes} of the {devAccuracy.n} dev claims,{" "}
          {pct(devAccuracy.estimate)}{" "}
          <span className="whitespace-nowrap">
            (95% CI {pct(devAccuracy.lower)} to {pct(devAccuracy.upper)})
          </span>
          . That is {gap.upper < 0 ? "worse than" : "no better than"} always answering
          &ldquo;supports&rdquo; ({pct(baseline)}): the paired difference is {pp(gap.estimate)}{" "}
          <span className="whitespace-nowrap">
            (95% CI {pp(gap.lower)} to {pp(gap.upper)})
          </span>
          . It never predicts {LABEL_TEXT.REFUTES.short.toLowerCase()} or{" "}
          {LABEL_TEXT.DISPUTED.short.toLowerCase()}.
        </p>
      </section>

      <SecondOpinion
        key={`${r.rule}:${r.claim}:${r.retrieval.passages.map((p) => p.id).join(",")}`}
        claim={r.claim}
        options={[
          {
            key: "retrieved",
            label: "Retrieved",
            passages: r.retrieval.passages.map((p) => ({ id: p.id, text: p.text })),
            modelLabel: c.label,
          },
        ]}
      />

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
        <SubsetNote r={r} agreement={agreement} />
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
                    className={dropped ? "text-muted-foreground line-through" : undefined}
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

/** Says on every result whether the pruned index is known to match the full 2024 search. */
function SubsetNote({ r, agreement }: { r: CheckResponse; agreement: SubsetAgreement }) {
  const size = int(r.retrieval.indexSize);
  if (r.retrieval.verified) {
    return (
      <p className="flex gap-2.5 rounded-lg border border-hit/40 bg-hit/8 px-3 py-2 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-hit" />
        <span>
          <span className="font-medium">Same passages as the full 2024 search.</span>{" "}
          <span className="text-muted-foreground">
            This claim&rsquo;s tags match a dataset claim or an example that the build re-ran over
            all 1.19M passages. The {size}-passage subset returns the same selection (exact ties
            aside).
          </span>
        </span>
      </p>
    );
  }
  const [fbAgree, fbTotal] = agreement.byPath.fallback;
  const fallback = r.retrieval.path === "fallback";
  return (
    <p
      className={cn(
        "flex gap-2.5 rounded-lg border px-3 py-2 text-sm",
        fallback ? "border-nei/50 bg-nei/10" : "border-border bg-card",
      )}
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">Searched a {size}-passage subset.</span> The
        full 2024 system searched all 1.19M passages and may select different ones, and so reach a
        different verdict. On {agreement.claims} hand-written test claims the subset picked the same
        passages {agreement.agree} times.
        {fallback &&
          ` On the fallback path it matched only ${fbAgree} of ${fbTotal}: the six best-scoring passages of 1.19M are rarely in the subset.`}
      </span>
    </p>
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
