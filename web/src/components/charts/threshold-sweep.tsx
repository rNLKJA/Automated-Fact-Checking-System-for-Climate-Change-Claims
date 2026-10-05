"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RuleId } from "@/lib/retrieval";
import type { SweepParam, Sweeps } from "@/lib/types";
import { ChartFrame, LegendItem, SegmentedControl } from "./chart-frame";

const PARAMS: {
  value: SweepParam;
  label: string;
  original: Record<RuleId, number>;
  describe: string;
}[] = [
  {
    value: "t_sim",
    label: "Cosine threshold",
    original: { submission: 0.55, notebook: 0.55 },
    describe: "minimum cosine similarity",
  },
  {
    value: "t_overlap",
    label: "Overlap threshold",
    original: { submission: 0.5, notebook: 0.5 },
    describe: "minimum share of shared tags",
  },
  {
    value: "top_n",
    label: "Top n",
    original: { submission: 6, notebook: 6 },
    describe: "maximum passages returned",
  },
  {
    value: "t_combined",
    label: "Score threshold",
    original: { submission: 1.0, notebook: 1.5 },
    describe: "minimum combined score",
  },
];

const LINES = [
  { key: "precision", label: "Precision", color: "var(--series-1)" },
  { key: "recall", label: "Recall", color: "var(--series-2)" },
  { key: "f", label: "F-score", color: "var(--series-3)" },
] as const;

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--popover-foreground)",
};
const tick = { fill: "var(--muted-foreground)", fontSize: 12 };

export function ThresholdSweep({ sweeps }: { sweeps: Sweeps }) {
  const [param, setParam] = useState<SweepParam>("t_sim");
  const [rule, setRule] = useState<RuleId>("submission");
  const meta = PARAMS.find((p) => p.value === param)!;
  const data = sweeps[rule][param];
  const original = meta.original[rule];
  const best = data.reduce((a, b) => (b.f > a.f ? b : a), data[0]);
  const fmtX = (v: number) => (param === "top_n" ? String(v) : v.toFixed(2));

  return (
    <ChartFrame
      id="thresholds"
      title="The retrieval threshold trade-off"
      takeaway={
        <>
          One setting at a time is swept on the dev set while the others keep their 2024 values
          (dotted line). With the {meta.describe}, the best dev F is {best.f.toFixed(4)} at{" "}
          {fmtX(best.value)}, against{" "}
          {(data.find((d) => Math.abs(d.value - original) < 1e-9)?.f ?? 0).toFixed(4)} for the
          original setting. No setting lifts F much above 0.05: the passages are simply not being
          found.
        </>
      }
      controls={
        <>
          <SegmentedControl label="Vary" value={param} options={PARAMS} onChange={setParam} />
          <SegmentedControl
            label="Rule"
            value={rule}
            options={[
              { value: "submission", label: "Submitted" },
              { value: "notebook", label: "Notebook" },
            ]}
            onChange={setRule}
          />
        </>
      }
      source="Computed by scripts/build_retrieval.py over all 1.19M passages for the 154 dev claims, scored with the course's eval.py definitions."
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {LINES.map((l) => (
          <LegendItem key={l.key} color={l.color} label={l.label} />
        ))}
      </div>
      <div
        className="h-64 w-full"
        role="img"
        aria-label={`Precision, recall and F-score against the ${meta.label.toLowerCase()}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="value"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtX}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={tick}
            />
            <YAxis
              domain={[0, 0.1]}
              ticks={[0, 0.025, 0.05, 0.075, 0.1]}
              allowDataOverflow={false}
              tickFormatter={(v: number) => v.toFixed(3)}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={tick}
            />
            <ReferenceLine
              x={original}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 3"
              label={{
                value: "2024",
                position: "top",
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              contentStyle={tooltipStyle}
              labelFormatter={(l) => `${meta.label}: ${fmtX(Number(l))}`}
              formatter={(v, name) => [
                Number(v).toFixed(4),
                LINES.find((x) => x.key === name)?.label ?? String(name),
              ]}
            />
            {LINES.map((l) => (
              <Line
                key={l.key}
                dataKey={l.key}
                stroke={l.color}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: l.color }}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">
          Share of claims that fall back to &ldquo;top n by score&rdquo;
        </p>
        <div
          className="h-32 w-full"
          role="img"
          aria-label="Fallback share against the same setting"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="value"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={fmtX}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tick={tick}
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                tickLine={false}
                axisLine={false}
                width={48}
                tick={tick}
                ticks={[0, 0.5, 1]}
              />
              <ReferenceLine x={original} stroke="var(--muted-foreground)" strokeDasharray="2 3" />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => `${meta.label}: ${fmtX(Number(l))}`}
                formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, "Fallback share"]}
              />
              <Line
                dataKey="fallbackShare"
                stroke="var(--foreground)"
                strokeOpacity={0.7}
                strokeWidth={2}
                dot={{ r: 2.5, strokeWidth: 0, fill: "var(--foreground)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartFrame>
  );
}
