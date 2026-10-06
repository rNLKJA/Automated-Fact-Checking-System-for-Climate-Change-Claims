import { VERDICT_STYLE } from "@/components/common/verdict";
import { int } from "@/lib/format";
import { LABEL_TEXT, LABELS, type Label } from "@/lib/labels";
import type { LengthBucket } from "@/lib/types";

/** 100% stacked bar per split with direct labels below each segment. */
export function LabelMix({ dist }: { dist: Record<"train" | "dev", Record<Label, number>> }) {
  return (
    <div className="space-y-6">
      {(["train", "dev"] as const).map((split) => {
        const total = LABELS.reduce((a, l) => a + dist[split][l], 0);
        return (
          <div key={split} className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">{split === "train" ? "Training set" : "Dev set"}</span>{" "}
              <span className="text-muted-foreground tabular">· {int(total)} claims</span>
            </p>
            <div
              className="flex h-7 gap-[2px] overflow-hidden rounded-md"
              role="img"
              aria-label={`${split} label distribution`}
            >
              {LABELS.map((l) => (
                <div
                  key={l}
                  title={`${LABEL_TEXT[l].short}: ${dist[split][l]} (${((dist[split][l] / total) * 100).toFixed(1)}%)`}
                  className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                  style={{
                    width: `${(dist[split][l] / total) * 100}%`,
                    background: VERDICT_STYLE[l].varName,
                  }}
                />
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {LABELS.map((l) => {
                const Icon = VERDICT_STYLE[l].icon;
                return (
                  <li key={l} className="flex items-center gap-1.5">
                    <Icon aria-hidden className={`size-3.5 ${VERDICT_STYLE[l].color}`} />
                    <span className="whitespace-nowrap">{LABEL_TEXT[l].short}</span>
                    <span className="ml-auto font-mono whitespace-nowrap text-muted-foreground tabular">
                      {((dist[split][l] / total) * 100).toFixed(0)}% · {dist[split][l]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal bars per passage-length bucket, labelled with the recomputed and reported counts. */
export function PassageLengths({ buckets }: { buckets: LengthBucket[] }) {
  const max = Math.max(...buckets.map((b) => b.count));
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Evidence passages by length in words</caption>
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="pb-2 text-left font-normal">
            Words
          </th>
          <th scope="col" className="pb-2 text-left font-normal">
            Passages (recomputed)
          </th>
          <th scope="col" className="pb-2 text-right font-normal">
            Report
          </th>
        </tr>
      </thead>
      <tbody>
        {buckets.map((b) => (
          <tr key={b.bucket} className="align-middle">
            <th scope="row" className="py-1 pr-3 text-left font-normal whitespace-nowrap">
              {b.maxWords === null
                ? `> ${b.minWords - 1}`
                : b.minWords === 0
                  ? `≤ ${b.maxWords}`
                  : `${b.minWords}–${b.maxWords}`}
            </th>
            <td className="w-full py-1">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 rounded-r-[4px] bg-series-1"
                  style={{ width: `${Math.max((b.count / max) * 80, 0.3)}%` }}
                  aria-hidden
                />
                <span className="font-mono text-xs tabular">{int(b.count)}</span>
              </div>
            </td>
            <td className="py-1 pl-3 text-right font-mono text-xs whitespace-nowrap text-muted-foreground tabular">
              {int(b.reportCount)} {b.count === b.reportCount ? "✓" : "✗"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
