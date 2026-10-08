import { ArrowRight, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/common/section";
import { ANTHROPIC_MODELS, DEFAULT_OPENAI_MODEL } from "@/lib/ai/providers";
import { BASELINE_BOOTSTRAP } from "@/lib/evaluation/baseline";
import { HARNESS_BOOTSTRAP, HARNESS_DEFAULTS } from "@/lib/evaluation/harness";
import { int, pct } from "@/lib/format";
import { SITE } from "@/lib/site";
import { listDecisions } from "@/server/docs";
import { getBaselineReport } from "@/server/evaluation";
import { freeTextParity, getOverview } from "@/server/stats";

export const metadata: Metadata = {
  title: "Methods & decisions",
  description:
    "Data provenance, method, evaluation design, assumptions, limitations, the AI use statement, the model card and the decision records behind the Climate Claim Checker.",
};

const TOC = [
  ["data", "Data provenance"],
  ["method", "Method"],
  ["evaluation", "Evaluation design"],
  ["assumptions", "Assumptions"],
  ["limitations", "Limitations"],
  ["change", "What I'd change"],
  ["ai-use", "AI use statement"],
  ["cards", "Model card and data statement"],
  ["decisions", "Decision records"],
] as const;

export default function MethodsPage() {
  const o = getOverview();
  const b = getBaselineReport();
  const parity = freeTextParity();
  const decisions = listDecisions();

  return (
    <>
      <PageHeader
        eyebrow="Methods & decisions"
        title="Where every number comes from, and how far to trust it"
      >
        This page sets out where the data comes from and how the system was evaluated. It states
        what the evaluation assumes and where it falls short, explains how AI is used on the site,
        and links to the decision records behind it, weak results included.
      </PageHeader>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-20 space-y-1 border-l border-border text-sm">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="-ml-px block border-l border-transparent py-1 pl-3 text-muted-foreground hover:border-foreground hover:text-foreground"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl min-w-0 space-y-14">
          <Section id="data" title="Data provenance">
            <ul className="list-disc space-y-2 pl-5 marker:text-border">
              <li>
                <Strong>Claims</Strong> come from the subject&rsquo;s public{" "}
                <a href={SITE.courseRepo} className="text-foreground underline underline-offset-4">
                  COMP90042_2024
                </a>{" "}
                repository: {int(o.claims.train)} training, {int(o.claims.dev)} dev and{" "}
                {int(o.claims.test)} test claims. The test labels were never released.
              </li>
              <li>
                <Strong>Evidence</Strong> is a corpus of {int(o.index.corpus_total)} English
                Wikipedia sentences. The site keeps a pruned index of {int(o.index.passages)} of
                them: every gold passage for the train and dev claims, every passage either rule
                could select for a dataset claim or a Try-it example, and a seeded random sample of{" "}
                {int(o.index.sample)} (seed {o.index.sample_seed}).
              </li>
              <li>
                <Strong>Model artefacts</Strong> (vectoriser vocabularies, the classifier&rsquo;s
                token table, retrieval runs and predictions) are rebuilt from the original code and
                data by the uv scripts in <Code>scripts/</Code>. The build is deterministic and
                writes one read-only SQLite file.
              </li>
              <li>
                <Strong>The classifier was retrained in 2026</Strong> with the notebook&rsquo;s code
                and hyper-parameters (seed {o.classifier.seed}, PyTorch {o.classifier.torch}),
                because the 2024 weights were never saved.
              </li>
              <li>
                The site displays the dev claims&rsquo; text. Train and test claim texts and the
                full corpus are not redistributed. The{" "}
                <Link href="/methods/data-statement" className="text-foreground underline">
                  data statement
                </Link>{" "}
                has the details.
              </li>
            </ul>
          </Section>

          <Section id="method" title="Method">
            <p>
              Two stages, kept exactly as the team built them. Retrieval tags each passage with its
              top TF-IDF keywords and scores it against the claim&rsquo;s stems by cosine similarity
              plus tag overlap. Passages above both thresholds that share the most tags are kept, up
              to six, with a fallback to the six best scores. A Transformer encoder trained from
              scratch then reads the claim and evidence stems and picks one of four verdicts.
            </p>
            <p>
              Every step runs as a TypeScript port that is tested against the original Python, down
              to NLTK&rsquo;s stemmer and numpy&rsquo;s tie-breaking. The{" "}
              <Link href="/method" className="text-foreground underline">
                pipeline walkthrough
              </Link>{" "}
              follows one claim through every stage.
            </p>
          </Section>

          <Section id="evaluation" title="Evaluation design">
            <ul className="list-disc space-y-2 pl-5 marker:text-border">
              <li>
                <Strong>Unit and sample.</Strong> The unit is the claim. All results use the {b.n}{" "}
                dev claims, because the test labels were never released. Each claim moves accuracy
                by {(100 / b.n).toFixed(2)} percentage points.
              </li>
              <li>
                <Strong>Metrics.</Strong> The course&rsquo;s own metrics come first: evidence
                precision, recall and F-score per claim, label accuracy, and the harmonic mean of
                mean F and accuracy. Macro-F1 and per-label recall are added because the labels are
                imbalanced.
              </li>
              <li>
                <Strong>Uncertainty.</Strong> Every result carries a 95% interval. Proportions use
                the Wilson score interval. Means, F1 and the harmonic mean use a percentile
                bootstrap that resamples whole claims ({int(BASELINE_BOOTSTRAP.resamples)}{" "}
                resamples, seed {BASELINE_BOOTSTRAP.seed}), so a claim&rsquo;s retrieval and verdict
                move together.
              </li>
              <li>
                <Strong>Comparisons are paired.</Strong> Two systems are compared on the same
                claims. The accuracy difference gets a paired bootstrap interval, McNemar&rsquo;s
                exact test uses only the claims where the two disagree, and Cohen&rsquo;s h gives
                the size of the gap.
              </li>
              <li>
                <Strong>Training-seed spread.</Strong> The Transformer and the LSTM are each
                retrained under five seeds with the notebook&rsquo;s code, so the run-to-run spread
                sits next to the single-run numbers. The seed-42 run is the site&rsquo;s model and
                reproduces its stored predictions exactly.
              </li>
              <li>
                <Strong>Baselines.</Strong> Always answering &ldquo;supports&rdquo; (
                {pct(b.majority.accuracy.estimate)} on dev) is the floor. The same classifier with
                gold evidence ({pct(b.protocols.gold_evidence.accuracy.estimate)}) shows the cost of
                retrieval.
              </li>
              <li>
                <Strong>Checked twice.</Strong> <Code>scripts/stats_reference.py</Code> recomputes
                every interval with numpy, scikit-learn and statsmodels, using a Python port of the
                same random number generator. The test suite requires the two to agree to twelve
                decimal places.
              </li>
              <li>
                <Strong>The LLM harness.</Strong> A seeded random sample of dev claims (default N ={" "}
                {HARNESS_DEFAULTS.n}, seed {HARNESS_DEFAULTS.seed}) goes to the visitor&rsquo;s
                model with the same retrieved passages the classifier read, and again with the gold
                passages. Calls that fail for infrastructure reasons are excluded and counted.
                Unusable answers are scored as wrong. Citation validity is the share of answers
                whose cited ids were all among the passages shown. Its bootstrap uses{" "}
                {int(HARNESS_BOOTSTRAP.resamples)} resamples, seed {HARNESS_BOOTSTRAP.seed}.
              </li>
            </ul>
            <p>
              The results are on the{" "}
              <Link href="/results#uncertainty" className="text-foreground underline">
                results page
              </Link>{" "}
              and the comparison is on the{" "}
              <Link href="/evaluation" className="text-foreground underline">
                LLM evaluation page
              </Link>
              .
            </p>
          </Section>

          <Section id="assumptions" title="Assumptions">
            <ul className="list-disc space-y-2 pl-5 marker:text-border">
              <li>
                The dev claims are a fair sample of the claims the system would meet, drawn
                independently. The bootstrap, the Wilson interval and McNemar&rsquo;s test all rest
                on that.
              </li>
              <li>
                The annotators&rsquo; labels and gold passages are correct and complete enough. A
                relevant passage that is not on the gold list counts as a miss.
              </li>
              <li>
                One retrain stands in for the 2024 model. Its training curves track the 2024 log
                closely, but its accuracy on retrieved evidence differs from the report&rsquo;s.
                Retraining under five seeds shows how far another run could move it.
              </li>
              <li>
                For the LLM, the instruction to judge only from the passages is followed. Nothing
                can enforce that, and a model may still use what it already knows.
              </li>
            </ul>
          </Section>

          <Section id="limitations" title="Limitations">
            <ul className="list-disc space-y-2 pl-5 marker:text-border">
              <li>
                The dev set chose the best training epoch and then reported the results, so the
                classifier&rsquo;s dev numbers are optimistic.
              </li>
              <li>
                With {b.n} claims the intervals are wide, and for the rarer labels (
                {Math.min(...b.byLabel.map((x) => x.n))} to {Math.max(...b.byLabel.map((x) => x.n))}{" "}
                claims) wider still.
              </li>
              <li>
                The retrained classifier scores {pct(b.protocols.batch.accuracy.estimate)} on
                retrieved evidence where the report gave {pct(o.report.validation.accuracy)}. The
                report&rsquo;s model cannot be recovered, so the gap cannot be explained further.
              </li>
              <li>
                Free-text claims search a {int(o.index.passages)}-passage subset. On {parity.claims}{" "}
                held-out sentences it matched the full search {parity.submission.agree} times.
              </li>
              <li>
                No LLM results ship with the site. They depend on the visitor&rsquo;s model, the
                date and the sample, they vary between runs, and the public dataset may be in a
                model&rsquo;s training data.
              </li>
            </ul>
          </Section>

          <Section id="change" title="What I'd change">
            <ul className="list-disc space-y-2 pl-5 marker:text-border">
              <li>
                Evaluate retrieval on its own first, with recall at k and a BM25 baseline, before
                building a classifier on top of it.
              </li>
              <li>
                Hold out part of the training claims for model selection and use the dev set once.
              </li>
              <li>
                Fit a TF-IDF and logistic regression baseline, weight the classes, and keep only
                models that beat the baseline on a paired test.
              </li>
              <li>
                Report every number with an interval from the start, and retrain over several seeds
                so one lucky run cannot decide a comparison.
              </li>
            </ul>
          </Section>

          <Section id="ai-use" title="AI use statement">
            <p>
              AI is optional on this site. Every page works without it, and nothing is sent to any
              AI provider unless you add your own API key in AI settings (the key icon in the
              header).
            </p>
            <Sub title="What AI does here">
              <ul className="list-disc space-y-2 pl-5 marker:text-border">
                <li>
                  <Strong>Second opinion.</Strong> On a claim page or a Try-it result, an LLM can
                  read the claim and the evidence passages and return a verdict, the ids of the
                  passages it relied on and a one-line rationale.
                </li>
                <li>
                  <Strong>Evaluation harness.</Strong> The LLM evaluation page runs the same task on
                  a sample of dev claims and compares the answers with the 2024 classifier&rsquo;s.
                </li>
              </ul>
            </Sub>
            <Sub title="What AI never does here">
              <ul className="list-disc space-y-2 pl-5 marker:text-border">
                <li>
                  It never changes the 2024 system&rsquo;s results or any number in the database.
                </li>
                <li>It never runs without your key and your click.</li>
                <li>It is never presented as a fact-check of a real-world claim.</li>
                <li>Its output is never shown without an &ldquo;AI-generated&rdquo; label.</li>
              </ul>
            </Sub>
            <Sub title="What is sent, and where">
              <p>
                Your browser sends the claim text, the evidence passages with their ids and a fixed
                instruction straight to the provider you chose: Anthropic (
                <Code>{ANTHROPIC_MODELS[0].id}</Code> by default, or{" "}
                <Code>{ANTHROPIC_MODELS[1].id}</Code>) or OpenAI (
                <Code>{DEFAULT_OPENAI_MODEL}</Code> by default). Your key goes only in that
                request&rsquo;s headers. It is kept in this tab&rsquo;s sessionStorage, or in
                localStorage if you tick &ldquo;remember on this device&rdquo;, and &ldquo;forget
                keys&rdquo; deletes it. It is never sent to this site&rsquo;s server, never logged
                and never written to the audit log. The provider&rsquo;s own terms and data
                retention apply to what you send.
              </p>
            </Sub>
            <Sub title="Human in the loop and audit trail">
              <p>
                Every call, including failed ones, is recorded in the{" "}
                <Link href="/ai-log" className="text-foreground underline">
                  AI audit log
                </Link>{" "}
                in your browser. A record holds the prompt, the output, the model, the latency, the
                token usage the provider reported and your decision on the output: accepted, edited
                or rejected. You can export it as JSON or CSV and clear it at any time. Answers are
                checked against a schema, and cited passage ids are checked against the passages the
                model was shown.
              </p>
            </Sub>
            <p>
              The design is informed by the Australian Government&rsquo;s policy for the responsible
              use of AI in government, the transparency principles of the EU AI Act and the NIST AI
              Risk Management Framework. It is a personal project and makes no claim of compliance
              with any of them. The reasoning is in{" "}
              <Link
                href="/methods/decisions/dr-004-byok-browser-only-llm-evaluation"
                className="text-foreground underline"
              >
                DR-004
              </Link>
              .
            </p>
          </Section>

          <Section id="cards" title="Model card and data statement">
            <div className="grid gap-4 sm:grid-cols-2">
              <DocLink
                href="/methods/model-card"
                title="Model card"
                body="Intended use, training data, evaluation with intervals, known failure modes and ethical considerations."
              />
              <DocLink
                href="/methods/data-statement"
                title="Data statement"
                body="Where the claims and passages come from, label imbalance, the no-pretraining rule and what is redistributed."
              />
            </div>
          </Section>

          <Section id="decisions" title="Decision records">
            <p>
              Each record states the decision first, then the context, the options, why, what
              happened and what I&rsquo;d change. Records are never edited once accepted. A later
              record supersedes them instead.
            </p>
            <ol className="space-y-3">
              {decisions.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/methods/decisions/${d.slug}`}
                    className="group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/30"
                  >
                    <p className="font-mono text-xs text-muted-foreground">
                      {d.id} · {d.decided} · {d.status}
                    </p>
                    <p className="mt-1 font-serif text-xl font-medium text-foreground">{d.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {d.decision}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-sm text-foreground">
                      Read the record{" "}
                      <ArrowRight
                        aria-hidden
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} id={id} className="scroll-mt-24 space-y-4">
      <h2 id={`${id}-h`} className="text-headline font-medium">
        {title}
      </h2>
      <div className="space-y-4 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-serif text-xl font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.85em] text-foreground">{children}</code>;
}

function DocLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/30"
    >
      <FileText aria-hidden className="size-5 text-muted-foreground" />
      <p className="mt-2 font-serif text-xl font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}
