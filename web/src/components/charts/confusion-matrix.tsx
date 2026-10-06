"use client";

import { useState } from "react";

import { LABEL_TEXT, LABELS } from "@/lib/labels";
import { PROTOCOLS, type Protocol } from "@/lib/types";
import { SegmentedControl } from "./chart-frame";

type Matrix = { matrix: number[][]; accuracy: number; total: number };

/** Compact column/row labels for narrow screens (the full label stays available to screen readers). */
const ABBR: Record<(typeof LABELS)[number], string> = {
  SUPPORTS: "S",
  REFUTES: "R",
  NOT_ENOUGH_INFO: "NEI",
  DISPUTED: "D",
};

const STEPS = [
  "var(--seq-100)",
  "var(--seq-200)",
  "var(--seq-300)",
  "var(--seq-400)",
  "var(--seq-500)",
  "var(--seq-600)",
  "var(--seq-700)",
];

export function ConfusionMatrix({ data }: { data: Record<Protocol, Matrix> }) {
  const [protocol, setProtocol] = useState<Protocol>("batch");
  const m = data[protocol];
  const max = Math.max(1, ...m.matrix.flat());
  return (
    <div className="space-y-4">
      <SegmentedControl
        label="Predictions"
        value={protocol}
        onChange={setProtocol}
        options={(Object.keys(PROTOCOLS) as Protocol[]).map((p) => ({
          value: p,
          label: PROTOCOLS[p].title,
        }))}
      />
      <p className="text-sm text-muted-foreground">
        Accuracy{" "}
        <span className="font-mono text-foreground tabular">{(m.accuracy * 100).toFixed(1)}%</span>{" "}
        on {m.total} dev claims. {PROTOCOLS[protocol].description}
      </p>
      <div
        className="overflow-x-auto"
        role="region"
        aria-label="Confusion matrix table"
        tabIndex={0}
      >
        <table className="w-full table-fixed border-separate border-spacing-[3px] text-sm">
          <caption className="sr-only">
            Confusion matrix: rows are gold labels, columns are predicted labels
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-16 text-left text-[0.7rem] leading-tight font-normal text-muted-foreground sm:w-32 sm:text-xs"
              >
                gold ↓ <span className="whitespace-nowrap">/ predicted →</span>
              </th>
              {LABELS.map((l) => (
                <th key={l} scope="col" className="px-1 pb-1 text-center text-xs font-medium">
                  <LabelText label={l} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LABELS.map((gold, i) => (
              <tr key={gold}>
                <th scope="row" className="pr-2 text-left text-xs font-medium whitespace-nowrap">
                  <LabelText label={gold} />
                </th>
                {LABELS.map((pred, j) => {
                  const v = m.matrix[i][j];
                  const step = v === 0 ? -1 : Math.min(6, Math.floor((v / max) * 6.999));
                  return (
                    <td
                      key={pred}
                      className="h-12 rounded-md text-center font-mono tabular"
                      style={{
                        background: step < 0 ? "var(--muted)" : STEPS[step],
                        color:
                          step < 0
                            ? "var(--muted-foreground)"
                            : `var(--seq-ink-${(step + 1) * 100})`,
                        outline: i === j ? "2px solid var(--foreground)" : undefined,
                        outlineOffset: -2,
                      }}
                      title={`gold ${LABEL_TEXT[gold].short}, predicted ${LABEL_TEXT[pred].short}: ${v}`}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Outlined cells are correct predictions. Stronger blue means more claims.
        <span className="sm:hidden">
          {" "}
          S = supports, R = refutes, NEI = not enough info, D = disputed.
        </span>
      </p>
    </div>
  );
}

function LabelText({ label }: { label: (typeof LABELS)[number] }) {
  return (
    <>
      <span className="sm:hidden" aria-hidden>
        {ABBR[label]}
      </span>
      <span className="sr-only sm:not-sr-only">{LABEL_TEXT[label].short}</span>
    </>
  );
}
