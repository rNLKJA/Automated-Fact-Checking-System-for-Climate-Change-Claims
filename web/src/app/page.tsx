import {
  ArrowRight,
  BookOpen,
  CirclePlay,
  Cpu,
  Database,
  FlaskConical,
  Search,
} from "lucide-react";
import Link from "next/link";

import { Stripes } from "@/components/common/stripes";
import { Eyebrow, SectionHeading } from "@/components/common/section";
import { VerdictBadge } from "@/components/common/verdict";
import { Button } from "@/components/ui/button";
import { claimNumber, fixed, int, pct, pp } from "@/lib/format";
import { SITE, TEAM } from "@/lib/site";
import { getClaimDetail } from "@/server/claims";
import { getMeta } from "@/server/db";
import { getBaselineReport } from "@/server/evaluation";
import { getOverview, labelDistribution } from "@/server/stats";

const PIPELINE = [
  {
    icon: FlaskConical,
    title: "Clean",
    body: "Expand contractions, lowercase, strip punctuation, tokenise, drop stopwords and Porter-stem every word.",
  },
  {
    icon: BookOpen,
    title: "Tag",
    body: "A claim's tags are its sorted stems. Each passage was tagged in advance with its ten highest-scoring TF-IDF keywords.",
  },
  {
    icon: Search,
    title: "Score",
    body: "Compare tags with a 1,000-term TF-IDF vectorizer (cosine similarity) plus the share of tags in common.",
  },
  {
    icon: Database,
    title: "Select",
    body: "Keep passages with cosine > 0.55 and overlap > 0.5 that share the most tags (up to six). If none qualify, take the top six by score.",
  },
  {
    icon: Cpu,
    title: "Classify",
    body: "A Transformer trained from scratch reads claim + evidence stems (128 tokens) and picks one of four verdicts.",
  },
];

export default function HomePage() {
  const o = getOverview();
  const base = getBaselineReport();
  const acc = base.protocols.batch.accuracy;
  const gold = base.protocols.gold_evidence.accuracy;
  const gap = base.classifierVsMajority.difference;
  const example = getClaimDetail("claim-752");
  const artifact = getMeta<{ term: string; passages: number; of: number }>("tag_artifact");
  const saved = example?.runs.find((r) => r.summary.run === "saved_2024");
  const prediction = example?.predictions.find((p) => p.protocol === "batch");
  const train = labelDistribution().train;
  const share = (n: number) => pct(n / o.claims.train, 0);

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-border/70">
        <Stripes className="h-2" count={64} />
        <div className="absolute inset-0 -z-10 paper-grain opacity-60" aria-hidden />
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div className="space-y-7">
            <Eyebrow>
              {SITE.subject.code} {SITE.subject.name} · {SITE.university} · {SITE.term}
            </Eyebrow>
            <h1 className="text-display font-medium">
              Can a student system from 2024 fact-check a{" "}
              <em className="text-stripe-cold italic dark:text-[var(--stripe-05)]">climate</em>{" "}
              <em className="text-stripe-warm italic dark:text-[var(--stripe-12)]">claim</em>?
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Type a statement about climate science. The original pipeline searches Wikipedia
              passages for evidence using TF-IDF, then a Transformer trained from scratch labels the
              claim <span className="text-foreground">supported</span>,{" "}
              <span className="text-foreground">refuted</span>,{" "}
              <span className="text-foreground">disputed</span> or{" "}
              <span className="text-foreground">not enough info</span>. It is re-run faithfully
              here, weak scores included.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 px-5 text-base">
                <Link href="/try">
                  Try a claim <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5 text-base">
                <Link href="/explore">Explore the 154 dev claims</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="h-11 px-4 text-base">
                <Link href="/tour">
                  <CirclePlay aria-hidden /> Watch the tour
                </Link>
              </Button>
            </div>
          </div>

          {example && saved && prediction && (
            <figure className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_0_var(--border),0_24px_48px_-32px_color-mix(in_oklab,var(--foreground)_30%,transparent)] sm:p-6">
              <figcaption className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Dev claim {claimNumber(example.claim.id)}</span>
                <Link
                  href={`/explore/${example.claim.id}`}
                  aria-label={`Open dev claim ${claimNumber(example.claim.id)}`}
                  className="underline-offset-4 hover:underline"
                >
                  Open
                </Link>
              </figcaption>
              <blockquote className="font-serif text-2xl leading-snug">
                &ldquo;{example.claim.text}&rdquo;
              </blockquote>
              <div className="mt-5 space-y-2.5">
                {saved.passages.map((p) => (
                  <p
                    key={p.id}
                    className={
                      "rounded-lg border px-3 py-2 text-sm leading-relaxed " +
                      (p.isGold ? "border-hit/50 bg-hit/8" : "border-border text-muted-foreground")
                    }
                  >
                    {p.text}
                    {p.isGold && (
                      <span className="ml-2 text-xs font-medium whitespace-nowrap text-foreground">
                        ✓ gold
                      </span>
                    )}
                  </p>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm">
                <span className="text-muted-foreground">Annotators:</span>
                {example.claim.label && <VerdictBadge label={example.claim.label} size="sm" />}
                <span className="ml-2 text-muted-foreground">Model:</span>
                <VerdictBadge label={prediction.label} size="sm" />
                <span className="ml-auto text-xs text-muted-foreground tabular">
                  evidence F {fixed(saved.summary.f, 2)} ({saved.passages.length} retrieved,{" "}
                  {saved.summary.nCorrect} of {example.gold.length} gold)
                </span>
              </div>
            </figure>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------- the brief */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="The assignment" title="What the coursework asked for">
          The task, paraphrased: build a system that, given a claim about climate science, finds
          supporting or contradicting passages in a knowledge source of about 1.2 million Wikipedia
          sentences and classifies the claim. Pretrained language models and embeddings were not
          allowed. Everything had to be trained from scratch on {int(o.claims.train)} labelled
          claims.
        </SectionHeading>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            [
              "1 · Retrieve",
              "Return a small set of evidence passages for each claim, from a corpus of " +
                int(o.report.corpus_size) +
                " passages.",
            ],
            [
              "2 · Classify",
              "Label the claim SUPPORTS, REFUTES, NOT_ENOUGH_INFO or DISPUTED given that evidence.",
            ],
            [
              "3 · Be scored",
              "Evidence F-score against human-annotated passages, label accuracy, and their harmonic mean as the headline metric.",
            ],
          ].map(([t, b]) => (
            <div key={t} className="rounded-xl border border-border bg-card p-5">
              <p className="font-serif text-xl font-medium">{t}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- pipeline */}
      <section className="border-y border-border/70 bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading
            eyebrow="What the team built"
            title="A two-stage pipeline, kept exactly as it was"
          >
            Every step below is a TypeScript port of the 2024 notebook. Each was checked against the
            original Python, down to NLTK&rsquo;s stemmer and the order in which numpy breaks ties.
          </SectionHeading>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map((step, i) => (
              <li key={step.title} className="relative bg-card p-5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <step.icon aria-hidden className="size-4" />
                  <span className="font-mono text-xs tabular">0{i + 1}</span>
                </div>
                <p className="mt-3 font-serif text-xl font-medium">{step.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-muted-foreground">
            Walk through each stage with a real claim on the{" "}
            <Link href="/method" className="text-foreground underline underline-offset-4">
              method page
            </Link>
            .
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- results */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Key results" title="Honest numbers: retrieval was the weak link">
          The team&rsquo;s report scored the system on the validation (dev) set and on the hidden
          test set of the course leaderboard. Retrieval found the right passages for only{" "}
          {o.retrieval.dev_claims_with_any_hit_saved_2024} of {o.claims.dev} dev claims.
        </SectionHeading>
        <div
          className="mt-10 overflow-x-auto rounded-xl border border-border bg-card"
          role="region"
          aria-label="Reported results table"
          tabIndex={0}
        >
          <table className="w-full text-left text-xs sm:text-sm [&_td]:px-3 sm:[&_td]:px-5 [&_th]:px-3 sm:[&_th]:px-5">
            <caption className="sr-only">
              Results reported in the team&rsquo;s 2024 report (Table 2)
            </caption>
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" className="py-3 font-medium">
                  Reported in 2024
                </th>
                <th scope="col" className="py-3 text-right font-medium">
                  Evidence F
                </th>
                <th scope="col" className="py-3 text-right font-medium">
                  Accuracy
                </th>
                <th scope="col" className="py-3 text-right font-medium">
                  Harmonic mean
                </th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              <tr className="border-b border-border/70">
                <th scope="row" className="py-3 font-sans font-normal">
                  Validation (154 dev claims)
                </th>
                <td className="py-3 text-right">{o.report.validation.f.toFixed(5)}</td>
                <td className="py-3 text-right">{o.report.validation.accuracy.toFixed(5)}</td>
                <td className="py-3 text-right">{o.report.validation.hm.toFixed(5)}</td>
              </tr>
              <tr>
                <th scope="row" className="py-3 font-sans font-normal">
                  Test (course leaderboard)
                </th>
                <td className="py-3 text-right">{o.report.test.f.toFixed(5)}</td>
                <td className="py-3 text-right">{o.report.test.accuracy.toFixed(5)}</td>
                <td className="py-3 text-right">{o.report.test.hm.toFixed(5)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ReproCard
            status="Reproduced exactly"
            title={`Evidence F = ${o.retrieval.dev_f_submission_rerun.toFixed(5)}`}
            body="Re-running the retrieval rule over all 1.19M passages gives the reported dev F-score to every printed digit, and the notebook's own F = 0.0112 too."
          />
          <ReproCard
            status="Retrained, weights were never saved"
            title={`Accuracy ${pct(o.classifier.dev_acc_retrieved_batch)} (report: ${pct(o.report.validation.accuracy)})`}
            body={`Same code, data and hyper-parameters. The training curves track the 2024 log closely, but on retrieved evidence the model is right on ${acc.successes} of ${acc.n} dev claims (95% CI ${pct(acc.lower)} to ${pct(acc.upper)}), no better than always answering "supports" (${pct(base.majority.accuracy.estimate)}; paired difference ${pp(gap.estimate)}, 95% CI ${pp(gap.lower)} to ${pp(gap.upper)}). With gold evidence it reaches ${pct(gold.estimate)} (${pct(gold.lower)} to ${pct(gold.upper)}).`}
          />
          <ReproCard
            status="Matches the report"
            title="Corpus statistics"
            body={`The passage-length table in the report is recomputed from the corpus count for count (${int(o.report.corpus_size)} passages).`}
          />
        </div>
        <div className="mt-8">
          <Button asChild variant="outline">
            <Link href="/results">
              All charts and parity checks <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </section>

      {/* -------------------------------------------------------- findings */}
      <section className="border-y border-border/70 bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading
            eyebrow="Revisiting the code in 2026"
            title="Four things the re-run revealed"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Finding n="1" title="The Transformer never attended across words">
              The encoder was built without <code>batch_first=True</code> but fed (batch, sequence)
              tensors. So self-attention mixed the 16 claims in a mini-batch, never the words within
              one claim. Run on a single claim, the whole network reduces <em>exactly</em> to a
              lookup table of per-word scores. That makes every prediction on this site fully
              explainable.
            </Finding>
            <Finding n="2" title="The committed notebook is not the submitted code">
              The saved 2024 results come from a rule scoring <em>similarity + overlap</em>. The
              notebook on GitHub adds the similarity twice, and its last evaluation cell passes the
              raw claim text instead of its stems. That is why it printed F = 0.011 while the report
              says 0.043. All three variants are reproduced here.
            </Finding>
            <Finding
              n="3"
              title={`A stray Arabic word in ${pct(artifact.passages / artifact.of, 0)} of evidence tags`}
            >
              Keyword extraction took numpy&rsquo;s top-10 TF-IDF features. For short passages,
              numpy pads that list with zero-weight features in its own tie order. The last word of
              the 20,000-term vocabulary, <span lang="ar">{artifact.term}</span>, is alphabetic, so
              it landed in {int(artifact.passages)} passages&rsquo; tags.
            </Finding>
            <Finding n="4" title="Two of the four verdicts are never predicted">
              With {share(train.SUPPORTS)} of training claims labelled SUPPORTS and only{" "}
              {share(train.DISPUTED)} DISPUTED, the retrained model only ever answers{" "}
              <VerdictBadge label="SUPPORTS" size="sm" /> or{" "}
              <VerdictBadge label="NOT_ENOUGH_INFO" size="sm" />. That is the class-imbalance
              problem the report&rsquo;s discussion warned about.
            </Finding>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- about */}
      <section id="about" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="About this project"
          title={`${SITE.subject.code} ${SITE.subject.name}`}
        >
          {SITE.university}, {SITE.term}. Group project by {SITE.group}.
        </SectionHeading>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h3 className="font-serif text-xl font-medium">Team</h3>
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {TEAM.map((m) => (
                <li key={m.name} className="p-4">
                  <p className="font-medium">{m.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{m.role}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              The 2026 revival (this website, the reproducible build scripts and the TypeScript
              ports) was made by Rin Huang. The original notebook, report and code are kept
              unchanged in the repository for reference. The assignment&rsquo;s datasets and
              specification belong to the subject and are not hosted here.
            </p>
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="font-serif text-xl font-medium">Stack, then and now</h3>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">2024</dt>
                <dd>
                  Python in Google Colab: pandas, NLTK, contractions, scikit-learn TF-IDF, PyTorch
                  (Transformer and LSTM)
                </dd>
                <dt className="text-muted-foreground">2026</dt>
                <dd>
                  Next.js 16 and TypeScript ports of every step, a read-only SQLite index (
                  {int(o.index.passages)} passages), uv scripts that re-run the original Python, and
                  vitest parity tests
                </dd>
              </dl>
            </div>
            <Button asChild variant="outline">
              <a href={SITE.repo}>
                View the code on GitHub <ArrowRight aria-hidden />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

function ReproCard({ status, title, body }: { status: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {status}
      </p>
      <p className="mt-2 font-serif text-xl font-medium tabular">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Finding({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-border bg-card p-6">
      <p className="font-mono text-xs text-muted-foreground tabular">Finding {n}</p>
      <h3 className="mt-2 font-serif text-xl font-medium">{title}</h3>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground">
        {children}
      </div>
    </article>
  );
}
