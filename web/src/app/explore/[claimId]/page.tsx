import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/common/section";
import { ProbabilityBars, VerdictBadge } from "@/components/common/verdict";
import { EvidenceCard } from "@/components/evidence/evidence-card";
import { TagChips } from "@/components/evidence/tag-chips";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { claimNumber, fixed } from "@/lib/format";
import { pySplit } from "@/lib/text/pystr";
import { PROTOCOLS, RUNS, type ClaimDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getClaimDetail, listClaimIds } from "@/server/claims";

export function generateStaticParams() {
  return listClaimIds("dev").map((claimId) => ({ claimId }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/explore/[claimId]">): Promise<Metadata> {
  const { claimId } = await params;
  const d = getClaimDetail(claimId);
  if (!d) return { title: "Claim not found" };
  return {
    title: `Claim ${claimNumber(d.claim.id)}`,
    description: d.claim.text.slice(0, 160),
  };
}

export default async function ClaimPage({ params }: PageProps<"/explore/[claimId]">) {
  const { claimId } = await params;
  const d = getClaimDetail(claimId);
  if (!d) notFound();
  const { claim } = d;
  const claimTags = new Set(pySplit(claim.tags));

  return (
    <article>
      <div className="border-b border-border/70 bg-card/40">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-10 sm:px-6">
          <nav
            aria-label="Claim navigation"
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft aria-hidden className="size-4" /> All dev claims
            </Link>
            <div className="flex items-center gap-1">
              <NeighbourLink id={d.prevId} dir="prev" />
              <NeighbourLink id={d.nextId} dir="next" />
            </div>
          </nav>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-end">
            <div className="space-y-5">
              <Eyebrow>
                Dev claim · {claim.id} · #{claim.ord + 1} of 154
              </Eyebrow>
              <h1 className="font-serif text-[1.85rem] leading-snug font-normal sm:text-[2.35rem] sm:leading-[1.18]">
                &ldquo;{claim.text}&rdquo;
              </h1>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Claim tags (sorted stems; highlighted when a passage shares them)
                </p>
                <TagChips tags={pySplit(claim.tags)} label="Claim tags" />
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Annotators&rsquo; label</p>
              {claim.label && <VerdictBadge label={claim.label} size="lg" />}
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={{ pathname: "/try", query: { claim: claim.text } }}>
                  <Sparkles aria-hidden /> Run this claim live
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6">
        <Verdicts d={d} />
        <Evidence d={d} claimTags={claimTags} />
      </div>
    </article>
  );
}

function NeighbourLink({ id, dir }: { id: string | null; dir: "prev" | "next" }) {
  const label = dir === "prev" ? "Previous claim" : "Next claim";
  const Icon = dir === "prev" ? ArrowLeft : ArrowRight;
  if (!id) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-muted-foreground/50"
        aria-disabled
      >
        {dir === "next" ? null : <Icon aria-hidden className="size-4" />}
        {dir === "prev" ? "Previous" : "Next"}
        {dir === "next" ? <Icon aria-hidden className="size-4" /> : null}
      </span>
    );
  }
  return (
    <Link
      href={`/explore/${id}`}
      aria-label={`${label}: ${id}`}
      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {dir === "prev" && <Icon aria-hidden className="size-4" />}
      {dir === "prev" ? "Previous" : "Next"}
      {dir === "next" && <Icon aria-hidden className="size-4" />}
    </Link>
  );
}

function Verdicts({ d }: { d: ClaimDetail }) {
  const order = ["batch", "single", "gold_evidence"] as const;
  return (
    <section aria-labelledby="verdicts" className="space-y-5">
      <div className="max-w-3xl space-y-2">
        <h2 id="verdicts" className="text-2xl font-medium">
          The model&rsquo;s verdict
        </h2>
        <p className="text-muted-foreground">
          The Transformer retrained from the notebook (the 2024 weights were never saved), shown
          three ways. The first is how the notebook evaluated it.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {order.map((protocol) => {
          const p = d.predictions.find((x) => x.protocol === protocol);
          if (!p) return null;
          const right = p.label === d.claim.label;
          return (
            <div
              key={protocol}
              className={cn(
                "space-y-4 rounded-xl border bg-card p-5",
                protocol === "batch" ? "border-foreground/25" : "border-border",
              )}
            >
              <div>
                <p className="font-medium">{PROTOCOLS[protocol].title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {PROTOCOLS[protocol].description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <VerdictBadge label={p.label} />
                <span
                  className={cn("text-xs", right ? "text-foreground" : "text-muted-foreground")}
                >
                  {right ? "✓ matches the label" : "✗ differs from the label"}
                </span>
              </div>
              <ProbabilityBars probs={p.probs} highlight={p.label} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Evidence({ d, claimTags }: { d: ClaimDetail; claimTags: Set<string> }) {
  return (
    <section aria-labelledby="evidence" className="space-y-5">
      <div className="max-w-3xl space-y-2">
        <h2 id="evidence" className="text-2xl font-medium">
          Retrieved vs gold evidence
        </h2>
        <p className="text-muted-foreground">
          Gold passages were picked by the dataset&rsquo;s annotators. Retrieved passages are what
          the TF-IDF rule returned from all 1.19M passages. Switch between the submitted 2024 output
          and the re-runs.
        </p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <Tabs defaultValue="saved_2024" className="gap-4">
          <TabsList className="w-full justify-start gap-0.5 overflow-x-auto sm:w-fit">
            {d.runs.map(({ summary }) => (
              <TabsTrigger
                key={summary.run}
                value={summary.run}
                className="flex-none px-2.5 py-1.5"
              >
                {RUNS[summary.run].short}
              </TabsTrigger>
            ))}
          </TabsList>
          {d.runs.map(({ summary, passages }) => (
            <TabsContent key={summary.run} value={summary.run} className="space-y-4">
              <div className="rounded-xl border border-border bg-card/60 p-4">
                <p className="font-medium">{RUNS[summary.run].title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {RUNS[summary.run].description}
                </p>
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <Metric
                    k="Path"
                    v={
                      summary.path === "filtered"
                        ? `filtered (${summary.nFiltered} passed)`
                        : "fallback (none passed)"
                    }
                  />
                  <Metric k="Found" v={`${summary.nCorrect ?? 0} of ${d.gold.length} gold`} />
                  <Metric k="P" v={fixed(summary.precision, 2)} />
                  <Metric k="R" v={fixed(summary.recall, 2)} />
                  <Metric k="F" v={fixed(summary.f, 2)} />
                </dl>
              </div>
              <ol className="space-y-3">
                {passages.map((p) => (
                  <li key={p.id}>
                    <EvidenceCard
                      id={p.id}
                      text={p.text}
                      tags={p.tags}
                      claimTags={summary.run === "notebook_raw" ? undefined : claimTags}
                      rank={p.rank}
                      scores={p}
                      isGold={p.isGold}
                    />
                  </li>
                ))}
              </ol>
            </TabsContent>
          ))}
        </Tabs>
        <div className="space-y-4">
          <div className="flex h-9 items-center">
            <h3 className="font-serif text-lg font-medium">Gold evidence ({d.gold.length})</h3>
          </div>
          <ol className="space-y-3">
            {d.gold.map((g) => (
              <li key={g.id}>
                <EvidenceCard
                  id={g.id}
                  text={g.text}
                  tags={g.tags}
                  claimTags={claimTags}
                  className="bg-card/60"
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-mono tabular">{v}</dd>
    </div>
  );
}
