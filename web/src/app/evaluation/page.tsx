import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/common/section";
import { LlmHarness } from "@/components/evaluation/harness";
import { ANTHROPIC_MODELS, DEFAULT_OPENAI_MODEL } from "@/lib/ai/providers";
import { HARNESS_BOOTSTRAP, HARNESS_DEFAULTS } from "@/lib/evaluation/harness";
import { int, pct, range } from "@/lib/format";
import { getBaselineReport, harnessClaimSummaries } from "@/server/evaluation";

export const metadata: Metadata = {
  title: "LLM evaluation",
  description:
    "An honest, paired comparison of a large language model with the 2024 from-scratch classifier on the same dev claims and the same evidence: accuracy and macro-F1 with intervals, McNemar's test, citation validity, latency and tokens. Bring your own API key.",
};

export default function EvaluationPage() {
  const claims = harnessClaimSummaries();
  const b = getBaselineReport();
  const acc = b.protocols.batch.accuracy;
  const gold = b.protocols.gold_evidence.accuracy;
  return (
    <>
      <PageHeader
        eyebrow="LLM evaluation · bring your own key"
        title="Would a modern LLM do better with the same evidence?"
      >
        The 2024 classifier was trained from scratch because the course banned pretrained models.
        This page puts a large language model in its place: same claims, same retrieved passages,
        same scoring. You run it with your own API key, and the statistics say how much of any
        difference is more than noise.
      </PageHeader>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6">
        <section aria-labelledby="protocol" className="space-y-5">
          <h2 id="protocol" className="text-headline font-medium">
            The protocol
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card title="Same inputs">
              A seeded random sample of the {claims.length} dev claims (default N ={" "}
              {HARNESS_DEFAULTS.n}, seed {HARNESS_DEFAULTS.seed}). The LLM gets the claim and the
              very passages the 2024 classifier read, each tagged with its id.
            </Card>
            <Card title="Structured answer">
              It must return JSON: one of the four labels, the ids of the passages it relied on and
              a one-line rationale. The answer is validated with a schema; anything else counts as
              wrong.
            </Card>
            <Card title="Two conditions">
              <strong className="font-medium text-foreground">Retrieved evidence</strong> is the
              like-for-like test.{" "}
              <strong className="font-medium text-foreground">Gold evidence</strong> is an upper
              bound: what each system does when retrieval is perfect.
            </Card>
            <Card title="Paired statistics">
              Accuracy (Wilson interval), macro-F1 and the paired difference (bootstrap,{" "}
              {int(HARNESS_BOOTSTRAP.resamples)} resamples, seed {HARNESS_BOOTSTRAP.seed}),
              McNemar&rsquo;s exact test, Cohen&rsquo;s h, citation validity, the course&rsquo;s
              harmonic mean, latency and tokens.
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground sm:p-6">
              <h3 className="font-serif text-lg font-medium text-foreground">
                The bar to beat, on all {b.n} dev claims
              </h3>
              <p className="mt-2">
                The classifier is right on {pct(acc.estimate)} of claims{" "}
                <span className="font-mono text-xs">{range(acc.lower, acc.upper)}</span> with the
                retrieved evidence and {pct(gold.estimate)}{" "}
                <span className="font-mono text-xs">{range(gold.lower, gold.upper)}</span> with the
                gold evidence. Always answering &ldquo;supports&rdquo; scores{" "}
                {pct(b.majority.accuracy.estimate)}. It never predicts refuted or disputed. Full
                intervals and paired tests are on the{" "}
                <Link href="/results#uncertainty" className="text-foreground underline">
                  results page
                </Link>
                .
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground sm:p-6">
              <h3 className="font-serif text-lg font-medium text-foreground">
                Your key, your bill
              </h3>
              <p className="mt-2">
                Calls go from your browser straight to Anthropic (default{" "}
                <code className="font-mono text-foreground">{ANTHROPIC_MODELS[0].id}</code>, or{" "}
                <code className="font-mono text-foreground">{ANTHROPIC_MODELS[1].id}</code>) or
                OpenAI (default{" "}
                <code className="font-mono text-foreground">{DEFAULT_OPENAI_MODEL}</code>
                ). The key is never sent to this site. Every call is written to the{" "}
                <Link href="/ai-log" className="text-foreground underline">
                  AI audit log
                </Link>{" "}
                in your browser, which you can export.
              </p>
            </div>
          </div>
        </section>

        <LlmHarness claims={claims} />

        <section
          aria-labelledby="caveats"
          className="space-y-4 rounded-2xl border border-border bg-card/60 p-5 sm:p-6"
        >
          <h2 id="caveats" className="font-serif text-2xl font-medium">
            Reading the result fairly
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-border">
            <li>
              <span className="text-foreground">Not the course&rsquo;s rules.</span> The 2024 system
              could not use pretrained models; an LLM is nothing but pretraining. This measures how
              much that constraint cost, not who did better coursework.
            </li>
            <li>
              <span className="text-foreground">The labels are relative to the gold evidence.</span>{" "}
              An LLM that follows its instructions will often answer &ldquo;not enough info&rdquo;
              on retrieved passages that miss the point, and be marked wrong. That is the retrieval
              bottleneck showing, which is why the gold condition is there.
            </li>
            <li>
              <span className="text-foreground">Possible contamination.</span> The claims, labels
              and Wikipedia passages are public (the course published them on GitHub), so they may
              be in a model&rsquo;s training data, which would flatter the LLM.
            </li>
            <li>
              <span className="text-foreground">Small samples, one run.</span> Twenty claims give
              intervals about 40 points wide. Model answers can also vary between runs; Haiku is
              called at temperature 0, which reduces but does not remove that.
            </li>
            <li>
              <span className="text-foreground">What counts as failure.</span> Calls that fail for
              infrastructure reasons (key, network, rate limit after retries) are excluded and
              reported. Answers the model gave but that are unusable (bad JSON, refusal, cut off)
              are scored as wrong.
            </li>
          </ul>
          <p className="text-sm">
            <Link
              href="/methods#evaluation"
              className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
            >
              Evaluation design and AI use statement <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-serif text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
