import type { ReactNode } from "react";

import { SectionHeading } from "@/components/common/section";
import { VerdictBadge } from "@/components/common/verdict";
import type { BaselineReport } from "@/lib/evaluation/baseline";
import { fixed, int, pct, pp, pText, range, signed } from "@/lib/format";
import { LABEL_TEXT, LABELS } from "@/lib/labels";
import { describeCohensH, type Interval, type PairedComparison } from "@/lib/stats";
import { IntervalBar, ScaleLabels } from "./interval";

type Row = {
  name: string;
  method: string;
  value: string;
  interval: string;
  bar: Interval;
  headline?: boolean;
};

function MeasureGroup({
  title,
  scale,
  reference,
  referenceLabel,
  rows,
}: {
  title: string;
  scale: { min: number; max: number; left: string; right: string };
  reference?: number;
  referenceLabel?: string;
  rows: Row[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <h3 className="font-serif text-lg font-medium">{title}</h3>
        {referenceLabel && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="inline-block h-3 border-l border-dashed border-foreground/60"
            />
            {referenceLabel}
          </p>
        )}
      </div>
      <ul className="divide-y divide-border/70">
        {rows.map((r) => (
          <li
            key={r.name}
            className="grid gap-x-6 gap-y-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,1fr)] sm:items-center"
          >
            <div>
              <p className={r.headline ? "font-medium" : undefined}>{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.method}</p>
            </div>
            <p className="font-mono text-sm tabular">
              <span className="text-base text-foreground">{r.value}</span>{" "}
              <span className="whitespace-nowrap text-muted-foreground">{r.interval}</span>
            </p>
            <div className="space-y-0.5">
              <IntervalBar
                estimate={r.bar.estimate}
                lower={r.bar.lower}
                upper={r.bar.upper}
                min={scale.min}
                max={scale.max}
                reference={reference}
                tone={r.headline ? "series-1" : "series-3"}
              />
              <ScaleLabels left={scale.left} right={scale.right} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Comparison({
  title,
  a,
  b,
  c,
  children,
}: {
  title: string;
  a: string;
  b: string;
  c: PairedComparison;
  children: ReactNode;
}) {
  const h = c.cohensH;
  return (
    <article className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div>
        <h3 className="font-serif text-xl font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {a} vs {b.toLowerCase()}, on the same {c.n} claims.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">
            Accuracy difference (paired bootstrap, 95% CI)
          </dt>
          <dd className="mt-0.5 font-mono tabular">
            <span className="text-lg">{pp(c.difference.estimate)}</span>{" "}
            <span className="text-muted-foreground">
              {range(c.difference.lower, c.difference.upper, "pp")}
            </span>
          </dd>
          <IntervalBar
            className="mt-1.5"
            estimate={c.difference.estimate}
            lower={c.difference.lower}
            upper={c.difference.upper}
            min={-0.4}
            max={0.4}
            reference={0}
          />
          <ScaleLabels left="−40 pp" right="+40 pp" />
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">McNemar (exact)</dt>
          <dd className="mt-0.5 font-mono tabular">{pText(c.mcnemar.exactP)}</dd>
          <dd className="text-xs text-muted-foreground">
            {c.mcnemar.b} only {a.toLowerCase()} right · {c.mcnemar.c} only {b.toLowerCase()} right
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Effect size (Cohen&rsquo;s h)</dt>
          <dd className="mt-0.5 font-mono tabular">{signed(h, 2)}</dd>
          <dd className="text-xs text-muted-foreground">{describeCohensH(h)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Macro-F1 difference (paired bootstrap)</dt>
          <dd className="mt-0.5 font-mono tabular">
            {signed(c.macroF1Difference.estimate)}{" "}
            <span className="text-muted-foreground">
              {range(c.macroF1Difference.lower, c.macroF1Difference.upper, "signed")}
            </span>
          </dd>
        </div>
      </dl>
      <p className="border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </article>
  );
}

export function BaselineUncertainty({ report }: { report: BaselineReport }) {
  const r = report;
  const { resamples, seed, level } = r.options;
  const L = `${Math.round(level * 100)}%`;
  const acc = (name: string, method: string, e: BaselineReport["majority"], headline = false) => ({
    name,
    method,
    value: pct(e.accuracy.estimate),
    interval: range(e.accuracy.lower, e.accuracy.upper),
    bar: e.accuracy,
    headline,
  });
  const f1 = (name: string, e: BaselineReport["majority"], headline = false) => ({
    name,
    method: `Bootstrap, ${int(resamples)} resamples`,
    value: fixed(e.macroF1.estimate),
    interval: range(e.macroF1.lower, e.macroF1.upper, "fixed"),
    bar: e.macroF1,
    headline,
  });
  const boot = (name: string, i: Interval & { estimate: number }, headline = false) => ({
    name,
    method: `Mean over claims, bootstrap`,
    value: fixed(i.estimate),
    interval: range(i.lower, i.upper, "fixed"),
    bar: i,
    headline,
  });
  const weakest = r.byLabel.reduce((a, b) =>
    b.meanEvidenceF.estimate < a.meanEvidenceF.estimate ? b : a,
  );
  const vm = r.classifierVsMajority;
  const gr = r.goldVsRetrieved;

  return (
    <section className="space-y-6" aria-labelledby="uncertainty">
      <SectionHeading
        id="uncertainty"
        eyebrow="Uncertainty"
        title="The same numbers, with intervals"
      >
        {r.n} dev claims is a small sample: one claim moves accuracy by {fixed(100 / r.n, 2)}{" "}
        percentage points. Every interval below is a {L} interval. Proportions use the Wilson score
        interval. Everything else resamples whole claims ({int(resamples)} percentile-bootstrap
        resamples, seed {seed}), so retrieval and verdicts move together. The point estimates are
        the original values, unchanged.
      </SectionHeading>

      <div className="grid gap-4 lg:grid-cols-2">
        <MeasureGroup
          title="Label accuracy"
          scale={{ min: 0, max: 1, left: "0%", right: "100%" }}
          reference={r.majority.accuracy.estimate}
          referenceLabel={`always "supports" (${pct(r.majority.accuracy.estimate)})`}
          rows={[
            acc(
              "Notebook protocol, retrieved evidence",
              `${r.protocols.batch.correct} of ${r.n} · Wilson`,
              r.protocols.batch,
              true,
            ),
            acc(
              "One claim at a time, retrieved evidence",
              `${r.protocols.single.correct} of ${r.n} · Wilson`,
              r.protocols.single,
            ),
            acc(
              "With gold evidence",
              `${r.protocols.gold_evidence.correct} of ${r.n} · Wilson`,
              r.protocols.gold_evidence,
            ),
            acc('Always answer "supports"', `${r.majority.correct} of ${r.n} · Wilson`, r.majority),
          ]}
        />
        <MeasureGroup
          title="Macro-F1 (four labels weighted equally)"
          scale={{ min: 0, max: 1, left: "0", right: "1" }}
          rows={[
            f1("Notebook protocol, retrieved evidence", r.protocols.batch, true),
            f1("With gold evidence", r.protocols.gold_evidence),
            f1('Always answer "supports"', r.majority),
          ]}
        />
        <MeasureGroup
          title="Evidence retrieval (the team's saved 2024 lists)"
          scale={{ min: 0, max: 0.25, left: "0", right: "0.25" }}
          rows={[
            boot("Evidence F-score (course metric)", r.retrieval.f, true),
            boot("Precision", r.retrieval.precision),
            boot("Recall", r.retrieval.recall),
            boot("Harmonic mean of F and accuracy", r.harmonicMean),
          ]}
        />
        <MeasureGroup
          title="Claims where any gold passage was retrieved"
          scale={{ min: 0, max: 1, left: "0%", right: "100%" }}
          rows={[
            {
              name: "Any gold passage in the retrieved list",
              method: `${r.retrieval.anyGoldFound.successes} of ${r.n} · Wilson`,
              value: pct(r.retrieval.anyGoldFound.estimate),
              interval: range(r.retrieval.anyGoldFound.lower, r.retrieval.anyGoldFound.upper),
              bar: r.retrieval.anyGoldFound,
              headline: true,
            },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Comparison
          title='Is the classifier better than always saying "supports"?'
          a="The classifier"
          b="The baseline"
          c={vm}
        >
          {vm.difference.lower <= 0 && vm.difference.upper >= 0
            ? `On accuracy, no: the difference of ${pp(vm.difference.estimate)} has an interval that includes zero, and McNemar's test finds no clear difference (${pText(vm.mcnemar.exactP)}).`
            : `The accuracy difference is ${pp(vm.difference.estimate)} (${pText(vm.mcnemar.exactP)}).`}{" "}
          Its macro-F1 is higher because it sometimes gets &ldquo;not enough info&rdquo; right,
          which the baseline never does.
        </Comparison>
        <Comparison
          title="How much does the evidence matter?"
          a="Gold evidence"
          b="Retrieved evidence"
          c={gr}
        >
          The same classifier gains {pp(gr.difference.estimate)} when it reads the annotators&rsquo;
          passages instead of the retrieved ones ({pText(gr.mcnemar.exactP)}). Retrieval, not only
          the classifier, held the 2024 system back.
        </Comparison>
      </div>

      <div className="space-y-3">
        <h3 className="font-serif text-xl font-medium">Error analysis by gold label</h3>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Notebook-protocol verdicts on retrieved evidence. Recall is the share of each label the
          model got right (Wilson interval); precision is the share of its verdicts with that label
          that were right. Retrieval was weakest for {LABEL_TEXT[weakest.label].long.toLowerCase()}{" "}
          claims: mean evidence F {fixed(weakest.meanEvidenceF.estimate)}, with a gold passage found
          for {weakest.anyGoldFound.successes} of {weakest.n}.
        </p>
        <div
          className="overflow-x-auto rounded-xl border border-border bg-card"
          role="region"
          aria-label="Error analysis by gold label"
          tabIndex={0}
        >
          <table className="w-full min-w-[52rem] text-left text-sm">
            <caption className="sr-only">
              For each gold label: claim count, what the model predicted, recall and precision with
              intervals, and retrieval quality
            </caption>
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Gold label
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Claims
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Predicted as (S / R / NEI / D)
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Recall [{L} CI]
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Precision
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  F1
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Mean evidence F [CI]
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Gold passage found
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {r.byLabel.map((row) => {
                const pc = r.protocols.batch.perClass.find((m) => m.label === row.label);
                return (
                  <tr key={row.label}>
                    <th scope="row" className="px-4 py-3 font-normal">
                      <VerdictBadge label={row.label} size="sm" />
                    </th>
                    <td className="px-3 py-3 text-right font-mono tabular">{row.n}</td>
                    <td className="px-3 py-3 font-mono text-xs whitespace-nowrap tabular">
                      {LABELS.map((l) => row.predictedAs[l]).join(" / ")}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs tabular">
                      {pct(row.recall.estimate, 0)}{" "}
                      <span className="text-muted-foreground">
                        {range(row.recall.lower, row.recall.upper, "pct", 0)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs tabular">
                      {pc && pc.predicted > 0 ? pct(pc.precision, 0) : "never predicted"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs tabular">
                      {pc ? fixed(pc.f1, 2) : "–"}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs tabular">
                      {fixed(row.meanEvidenceF.estimate)}{" "}
                      <span className="text-muted-foreground">
                        {range(row.meanEvidenceF.lower, row.meanEvidenceF.upper, "fixed")}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular">
                      {row.anyGoldFound.successes} of {row.n}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          S = {LABEL_TEXT.SUPPORTS.short.toLowerCase()}, R ={" "}
          {LABEL_TEXT.REFUTES.short.toLowerCase()}, NEI ={" "}
          {LABEL_TEXT.NOT_ENOUGH_INFO.short.toLowerCase()}, D ={" "}
          {LABEL_TEXT.DISPUTED.short.toLowerCase()}. Intervals for the rarer labels are wide because
          they rest on {Math.min(...r.byLabel.map((x) => x.n))} to{" "}
          {Math.max(...r.byLabel.map((x) => x.n))} claims. Recomputed independently with numpy,
          scikit-learn and statsmodels in{" "}
          <code className="font-mono">scripts/stats_reference.py</code> and checked by the test
          suite.
        </p>
      </div>
    </section>
  );
}
