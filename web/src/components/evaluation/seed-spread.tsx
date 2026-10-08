import type { ModelKind, SeedSpread } from "@/lib/evaluation/seed-spread";
import { pct, pp } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAMES: Record<ModelKind, string> = { transformer: "Transformer", lstm: "LSTM" };

/** One row of dots (one per seed) on a fixed percentage scale. Decorative: values are in the table. */
function DotStrip({
  values,
  highlight,
  min,
  max,
  reference,
  tone,
}: {
  values: { seed: number; value: number }[];
  highlight: number;
  min: number;
  max: number;
  reference?: number;
  tone: string;
}) {
  const pos = (x: number) => `${((Math.min(max, Math.max(min, x)) - min) / (max - min)) * 100}%`;
  return (
    <div aria-hidden className="relative h-5">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {reference !== undefined && (
        <div
          className="absolute top-0 bottom-0 border-l border-dashed border-foreground/50"
          style={{ left: pos(reference) }}
        />
      )}
      {values.map((v) => (
        <div
          key={v.seed}
          className={cn(
            "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80",
            v.seed === highlight &&
              "size-3.5 opacity-100 ring-2 ring-foreground ring-offset-1 ring-offset-card",
          )}
          style={{ left: pos(v.value), background: tone }}
        />
      ))}
    </div>
  );
}

export function SeedSpreadCard({ s, majority }: { s: SeedSpread; majority: number }) {
  const t = s.models.transformer;
  const l = s.models.lstm;
  const wins = s.goldGap.filter((g) => g.gap > 0).length;
  const ties = s.goldGap.filter((g) => g.gap === 0).length;
  const meanGap = s.goldGap.reduce((a, g) => a + g.gap, 0) / s.goldGap.length;
  const strips = [
    {
      title: "Accuracy on the 2024 retrieved evidence",
      key: "retrievedAccuracy" as const,
      min: 0.3,
      max: 0.5,
      reference: majority,
      left: "30%",
      right: "50%",
    },
    {
      title: "Accuracy with gold evidence (what training selected on)",
      key: "goldAccuracy" as const,
      min: 0.5,
      max: 0.65,
      left: "50%",
      right: "65%",
    },
  ];
  return (
    <article className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="max-w-3xl space-y-2">
        <h3 className="font-serif text-xl font-medium">How much does the training seed matter?</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The site&rsquo;s classifier is one training run. Retraining both of the notebook&rsquo;s
          models with the same code under {s.seeds.length} seeds ({s.seeds.join(", ")}) shows the
          run-to-run spread. On retrieved evidence the Transformer scores between{" "}
          {pct(t.retrieved.min)} and {pct(t.retrieved.max)}, and the LSTM between{" "}
          {pct(l.retrieved.min)} and {pct(l.retrieved.max)}. All ten models score below always
          answering &ldquo;supports&rdquo; ({pct(majority)}), and none ever predicts refuted or
          disputed. With gold evidence the Transformer beats the LSTM on {wins} of {s.seeds.length}{" "}
          seeds{ties ? ` and ties on ${ties}` : ""}, by {pp(meanGap)} on average, so the 2024 choice
          between the two rested on noise.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {strips.map((strip) => (
          <div key={strip.key} className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {strip.title}
              {strip.reference !== undefined && " · dashed line: always “supports”"}
            </p>
            {(["transformer", "lstm"] as const).map((kind) => (
              <div key={kind} className="grid grid-cols-[6.5rem_1fr] items-center gap-3">
                <p className="text-sm">{NAMES[kind]}</p>
                <DotStrip
                  values={s.models[kind].runs.map((r) => ({ seed: r.seed, value: r[strip.key] }))}
                  highlight={42}
                  min={strip.min}
                  max={strip.max}
                  reference={strip.reference}
                  tone={kind === "transformer" ? "var(--series-1)" : "var(--series-2)"}
                />
              </div>
            ))}
            <div className="grid grid-cols-[6.5rem_1fr] gap-3">
              <span />
              <div
                aria-hidden
                className="flex justify-between font-mono text-[0.65rem] text-muted-foreground"
              >
                <span>{strip.left}</span>
                <span>{strip.right}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="overflow-x-auto rounded-xl border border-border"
        role="region"
        aria-label="Accuracy by training seed"
        tabIndex={0}
      >
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">
            Dev accuracy of the Transformer and the LSTM for each training seed
          </caption>
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th scope="col" rowSpan={2} className="px-4 py-2 font-medium">
                Seed
              </th>
              <th scope="colgroup" colSpan={3} className="px-3 pt-2 font-medium">
                Transformer
              </th>
              <th scope="colgroup" colSpan={3} className="px-3 pt-2 font-medium">
                LSTM
              </th>
            </tr>
            <tr>
              {["transformer", "lstm"].flatMap((k) => [
                <th key={`${k}-e`} scope="col" className="px-3 pb-2 font-normal">
                  best epoch
                </th>,
                <th key={`${k}-g`} scope="col" className="px-3 pb-2 text-right font-normal">
                  gold evidence
                </th>,
                <th key={`${k}-r`} scope="col" className="px-3 pb-2 text-right font-normal">
                  retrieved
                </th>,
              ])}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70 font-mono text-xs tabular">
            {s.seeds.map((seed, i) => {
              const tr = t.runs[i];
              const lr = l.runs[i];
              return (
                <tr key={seed} className={seed === 42 ? "bg-accent/40" : undefined}>
                  <th scope="row" className="px-4 py-2 font-sans font-normal">
                    {seed}
                    {seed === 42 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        the site&rsquo;s model
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2">{tr.bestEpoch}</td>
                  <td className="px-3 py-2 text-right">{pct(tr.goldAccuracy)}</td>
                  <td className="px-3 py-2 text-right">{pct(tr.retrievedAccuracy)}</td>
                  <td className="px-3 py-2">{lr.bestEpoch}</td>
                  <td className="px-3 py-2 text-right">{pct(lr.goldAccuracy)}</td>
                  <td className="px-3 py-2 text-right">{pct(lr.retrievedAccuracy)}</td>
                </tr>
              );
            })}
            <tr className="border-t border-border font-sans text-muted-foreground">
              <th scope="row" className="px-4 py-2 text-left font-normal">
                Mean (SD)
              </th>
              <td />
              <td className="px-3 py-2 text-right font-mono">
                {pct(t.gold.mean)} ({pp(t.gold.sd).replace("+", "")})
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {pct(t.retrieved.mean)} ({pp(t.retrieved.sd).replace("+", "")})
              </td>
              <td />
              <td className="px-3 py-2 text-right font-mono">
                {pct(l.gold.mean)} ({pp(l.gold.sd).replace("+", "")})
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {pct(l.retrieved.mean)} ({pp(l.retrieved.sd).replace("+", "")})
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Each seed retrains for ten epochs and keeps the epoch with the best dev accuracy on gold
        evidence, as the notebook does, so the gold-evidence column is optimistic. The seed-42 run
        reproduces the site&rsquo;s stored predictions for all 154 claims. Computed by{" "}
        <code className="font-mono">scripts/seed_spread.py</code> (PyTorch {s.torch}, CPU).
      </p>
    </article>
  );
}
