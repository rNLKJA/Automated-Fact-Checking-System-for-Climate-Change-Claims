import type { Metadata } from "next";

import { ChartFrame } from "@/components/charts/chart-frame";
import { ConfusionMatrix } from "@/components/charts/confusion-matrix";
import { LabelMix, PassageLengths } from "@/components/charts/static-charts";
import { ThresholdSweep } from "@/components/charts/threshold-sweep";
import { TrainingCurves } from "@/components/charts/training-curves";
import { PageHeader, SectionHeading } from "@/components/common/section";
import { int, pct } from "@/lib/format";
import { getMeta } from "@/server/db";
import {
  confusion,
  getOverview,
  labelDistribution,
  passageLengths,
  retrievalSweeps,
  trainingHistories,
} from "@/server/stats";

export const metadata: Metadata = {
  title: "Results",
  description:
    "Label balance, confusion matrices, retrieval threshold trade-offs, Transformer vs LSTM training curves, and every parity check against the 2024 numbers.",
};

type ParityRow = {
  what: string;
  source: string;
  original: string;
  rerun: string;
  status: "exact" | "close" | "differs";
};

export default function ResultsPage() {
  const o = getOverview();
  const dist = labelDistribution();
  const matrices = {
    batch: confusion("batch"),
    single: confusion("single"),
    gold_evidence: confusion("gold_evidence"),
  };
  const lengths = passageLengths();
  const artifact = getMeta<{ term: string; passages: number; of: number }>("tag_artifact");
  const histories = trainingHistories();
  // like for like: the report quotes the final (10th) epoch; the site's model is the best epoch
  const valAcc = (run: "2024" | "2026") => {
    const h = histories[run].transformer;
    const best = h.reduce((a, b) => (b.valAcc > a.valAcc ? b : a));
    return { final: h[h.length - 1], best };
  };
  const t24 = valAcc("2024");
  const t26 = valAcc("2026");
  const tiesSame =
    o.parity.dev.submission_equal_up_to_ties + o.parity.test.submission_equal_up_to_ties;
  const setsSame = o.parity.dev.submission_same_set + o.parity.test.submission_same_set;
  const totalLists = o.parity.dev.total + o.parity.test.total;
  const unexplained = [
    ...o.parity.dev.submission_unexplained,
    ...o.parity.test.submission_unexplained,
  ];

  const parity: ParityRow[] = [
    {
      what: "Dev evidence F-score (submitted retrieval)",
      source: "Report, Table 2",
      original: o.report.validation.f.toFixed(5),
      rerun: o.retrieval.dev_f_submission_rerun.toFixed(5),
      status: "exact",
    },
    {
      what: "Dev evidence F-score, notebook's final cell",
      source: "Notebook cell 58",
      original: o.printed.cell58_dev_eval.f.toFixed(6),
      rerun: o.retrieval.dev_f_notebook_raw_claim.toFixed(6),
      status: "exact",
    },
    {
      what: "eval.py harmonic mean (TypeScript port)",
      source: "Notebook cell 58",
      original: o.printed.cell58_dev_eval.hm.toFixed(6),
      rerun: "0.021717 from the same F and accuracy",
      status: "exact",
    },
    {
      what: "Retrieved passages for claim-752",
      source: "Notebook cell 26",
      original: "4 passages",
      rerun: "same 4, same order",
      status: "exact",
    },
    {
      what: "Saved 2024 retrieval lists re-derived",
      source: "Team's saved output files",
      original: `${totalLists} dev + test claims`,
      rerun: `${tiesSame} with identical scores (${setsSame} identical passage sets); ${unexplained.length} not explained`,
      status: "close",
    },
    {
      what: "Claim tags and keyword extraction",
      source: "Notebook cells 10, 16; saved tags",
      original: "printed examples + 1.19M tagged passages",
      rerun: "identical (TS port, numpy tie order included)",
      status: "exact",
    },
    {
      what: "Passage-length table",
      source: "Report, Table 1",
      original: `${int(o.report.corpus_size)} passages in 7 buckets`,
      rerun: o.lengthsMatchReport ? "every bucket identical" : "differs",
      status: o.lengthsMatchReport ? "exact" : "differs",
    },
    {
      what: "Transformer validation accuracy (gold evidence)",
      source: "Report §3.3.1, cell 43",
      original: `${pct(t24.final.valAcc, 2)} final epoch · ${pct(t24.best.valAcc, 2)} best (epoch ${t24.best.epoch})`,
      rerun: `${pct(t26.final.valAcc, 2)} final epoch · ${pct(t26.best.valAcc, 2)} best (epoch ${t26.best.epoch})`,
      status: "close",
    },
    {
      what: "Dev accuracy on retrieved evidence",
      source: "Report, Table 2",
      original: pct(o.report.validation.accuracy, 2),
      rerun: pct(o.classifier.dev_acc_retrieved_batch, 2) + " (retrained)",
      status: "differs",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Results"
        title="What the numbers say, and how closely they were reproduced"
      >
        All charts are computed from the original code and data by the build scripts. Nothing here
        is re-estimated or tuned. Where the 2026 re-run differs from 2024, the table at the bottom
        says so and why.
      </PageHeader>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-12 sm:px-6">
        <section className="space-y-6">
          <SectionHeading eyebrow="Data" title="An imbalanced task" />
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartFrame
              title="Label balance"
              takeaway={`SUPPORTS dominates and DISPUTED is rare in both splits. A model can score ${pct(o.classifier.majority_baseline_acc, 0)} on dev by always answering "supports".`}
              source="Gold labels from the course's train-claims.json and dev-claims.json."
            >
              <LabelMix dist={dist} />
            </ChartFrame>
            <ChartFrame
              title="Evidence passage lengths"
              takeaway="Most passages are one Wikipedia sentence of 11–50 words. The 13,578 passages of five words or fewer are easy to match spuriously on cosine similarity, as the report notes."
              source={`Recomputed from all ${int(o.report.corpus_size)} passages (words = whitespace-separated tokens) and checked against the report's Table 1.`}
            >
              <PassageLengths buckets={lengths} />
            </ChartFrame>
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeading eyebrow="Retrieval" title="Why retrieval was the bottleneck">
            Retrieval compares tags, not meaning. A passage that shares the stems &ldquo;sea&rdquo;
            and &ldquo;level&rdquo; with the claim scores well whether or not it is about sea-level
            rise. The tags also carry noise: the Arabic word <span lang="ar">{artifact.term}</span>{" "}
            sits in {int(artifact.passages)} of {int(artifact.of)} passages&rsquo; tags because of
            how numpy breaks ties.
          </SectionHeading>
          <ThresholdSweep sweeps={retrievalSweeps()} />
        </section>

        <section className="space-y-6">
          <SectionHeading eyebrow="Classification" title="Transformer vs LSTM, then and now" />
          <TrainingCurves histories={histories} />
          <ChartFrame
            title="Confusion matrix on the dev set"
            takeaway="The model only ever predicts SUPPORTS or NOT_ENOUGH_INFO. Refuted and disputed claims are always missed, whichever evidence it is given."
            source="Retrained Transformer (best epoch by validation accuracy). Rows: annotators' labels; columns: model verdicts."
          >
            <ConfusionMatrix data={matrices} />
          </ChartFrame>
        </section>

        <section className="space-y-6">
          <SectionHeading eyebrow="Parity" title="Reproduction checklist">
            Each row is enforced by an automated test in the repository (vitest for the TypeScript
            ports, assertions in the uv build scripts for the Python re-runs).
          </SectionHeading>
          {/* below sm: one card per check, so the 2026 value and status stay visible */}
          <ul className="space-y-3 sm:hidden" aria-label="Reproduction checklist">
            {parity.map((row) => (
              <li key={row.what} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{row.what}</p>
                  <StatusPill status={row.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{row.source}</p>
                <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">2024</dt>
                  <dd className="font-mono tabular">{row.original}</dd>
                  <dt className="text-muted-foreground">2026 re-run</dt>
                  <dd className="font-mono tabular">{row.rerun}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <div
            className="hidden overflow-x-auto rounded-xl border border-border bg-card sm:block"
            role="region"
            aria-label="Reproduction checklist table"
            tabIndex={0}
          >
            <table className="w-full min-w-[46rem] text-left text-sm">
              <caption className="sr-only">Original numbers versus the 2026 re-run</caption>
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Check
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    2024 source
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    2024 value
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    2026 re-run
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {parity.map((row) => (
                  <tr key={row.what}>
                    <th scope="row" className="px-4 py-3 font-normal">
                      {row.what}
                    </th>
                    <td className="px-4 py-3 text-muted-foreground">{row.source}</td>
                    <td className="px-4 py-3 font-mono text-xs tabular">{row.original}</td>
                    <td className="px-4 py-3 font-mono text-xs tabular">{row.rerun}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Why the accuracy differs.</span> The
              notebook never saved the trained weights, so the classifier was retrained with the
              same code, data and hyper-parameters (seed 42, on a CPU instead of Colab). Its
              training curves match the 2024 log closely. On retrieved evidence, though, it scores{" "}
              {pct(o.classifier.dev_acc_retrieved_batch, 1)} rather than the reported{" "}
              {pct(o.report.validation.accuracy, 1)}. The notebook itself printed{" "}
              {pct(o.printed.cell58_dev_eval.accuracy, 1)} in its final cell, and its closing note
              says the report numbers came from a model the team was still tweaking. With 154
              claims, each one is worth 0.65 percentage points, so small differences between trained
              models move accuracy visibly.
            </p>
            <p>
              <span className="font-medium text-foreground">
                Why the re-run does not match every saved list.
              </span>{" "}
              pandas&rsquo; default quicksort is not stable, so when several passages have exactly
              the same score, which of them makes the cut depends on the sort&rsquo;s internals
              (library version, row layout) rather than on the data. The re-run returns passages
              with the same scores as the saved lists for {tiesSame} of {totalLists} claims.{" "}
              {setsSame} of those are the very same passages; the other {tiesSame - setsSame} differ
              only in which tied passage was kept. The dev F-score is identical. The remaining{" "}
              {unexplained.length} saved lists ({unexplained.join(", ")}) are not explained by the
              rule: they look like top-six fallback lists even though passages pass the filter,
              which suggests some extra 2024 logic that the notebook does not contain. Their
              selection path is therefore shown as &ldquo;not recorded&rdquo;.
            </p>
            <p>
              <span className="font-medium text-foreground">Why the training curves differ.</span>{" "}
              The 2024 log peaked at {pct(t24.best.valAcc, 2)} in epoch {t24.best.epoch} and ended
              at {pct(t24.final.valAcc, 2)}, the figure the report quotes. The retrain peaked at{" "}
              {pct(t26.best.valAcc, 2)} in epoch {t26.best.epoch} and ended at{" "}
              {pct(t26.final.valAcc, 2)}, so it trails the 2024 run by about{" "}
              {Math.round((t24.final.valAcc - t26.final.valAcc) * 1000) / 10} percentage points
              either way. The site uses the best epoch, as the notebook&rsquo;s model selection did.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function StatusPill({ status }: { status: ParityRow["status"] }) {
  const map = {
    exact: { text: "Exact", cls: "bg-hit/12 ring-hit/40" },
    close: { text: "Close", cls: "bg-series-1/12 ring-series-1/35" },
    differs: { text: "Differs", cls: "bg-nei/14 ring-nei/45" },
  } as const;
  const s = map[status];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}
    >
      {s.text}
    </span>
  );
}
