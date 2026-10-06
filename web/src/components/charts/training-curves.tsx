"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Histories, HistoryPoint } from "@/lib/types";
import { ChartFrame, LegendItem, SegmentedControl } from "./chart-frame";

type Metric = "valAcc" | "trainAcc" | "valLoss" | "trainLoss";
const METRICS: { value: Metric; label: string }[] = [
  { value: "valAcc", label: "Val accuracy" },
  { value: "trainAcc", label: "Train accuracy" },
  { value: "valLoss", label: "Val loss" },
  { value: "trainLoss", label: "Train loss" },
];

const SERIES = [
  {
    key: "transformer_2026",
    model: "transformer",
    run: "2026",
    label: "Transformer · 2026 retrain",
    color: "var(--series-1)",
    dashed: false,
  },
  {
    key: "transformer_2024",
    model: "transformer",
    run: "2024",
    label: "Transformer · 2024 notebook",
    color: "var(--series-1)",
    dashed: true,
  },
  {
    key: "lstm_2026",
    model: "lstm",
    run: "2026",
    label: "LSTM · 2026 retrain",
    color: "var(--series-2)",
    dashed: false,
  },
  {
    key: "lstm_2024",
    model: "lstm",
    run: "2024",
    label: "LSTM · 2024 notebook",
    color: "var(--series-2)",
    dashed: true,
  },
] as const;

export function TrainingCurves({ histories }: { histories: Histories }) {
  const [metric, setMetric] = useState<Metric>("valAcc");
  const isAcc = metric.endsWith("Acc");
  const data = Array.from({ length: 10 }, (_, i) => {
    const row: Record<string, number> = { epoch: i + 1 };
    for (const s of SERIES) {
      const p: HistoryPoint | undefined = histories[s.run][s.model][i];
      if (p) row[s.key] = p[metric];
    }
    return row;
  });
  const fmt = (v: number) => (isAcc ? `${(v * 100).toFixed(1)}%` : v.toFixed(3));

  return (
    <ChartFrame
      id="training"
      title="Training curves: Transformer vs LSTM"
      takeaway="The retrain (solid) tracks the curves printed in the 2024 notebook (dashed) closely. The Transformer learns from the first epoch; the LSTM sits at the majority-class rate until epoch 6. Validation here uses gold evidence, which is easier than the retrieved evidence used at test time."
      controls={
        <>
          <SegmentedControl label="Metric" value={metric} options={METRICS} onChange={setMetric} />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {SERIES.map((s) => (
              <LegendItem key={s.key} color={s.color} label={s.label} dashed={s.dashed} />
            ))}
          </div>
        </>
      }
      source="Source: training logs printed by notebook cells 43–44 (2024) and scripts/train_classifier.py (2026: same code and hyper-parameters, seed 42, CPU). 10 epochs, batch 16, Adam lr 1e-4."
    >
      <div
        className="h-72 w-full"
        role="img"
        aria-label={`Line chart of ${METRICS.find((m) => m.value === metric)?.label} per epoch for both models and both runs`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="epoch"
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              label={{
                value: "epoch",
                position: "insideBottomRight",
                offset: -2,
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
            />
            <YAxis
              domain={isAcc ? [0.4, 0.7] : [0.8, 1.35]}
              ticks={isAcc ? [0.4, 0.5, 0.6, 0.7] : [0.8, 0.9, 1, 1.1, 1.2, 1.3]}
              tickFormatter={(v: number) => (isAcc ? `${Math.round(v * 100)}%` : v.toFixed(2))}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
              labelFormatter={(l) => `Epoch ${l}`}
              formatter={(v, name) => [
                fmt(Number(v)),
                SERIES.find((s) => s.key === name)?.label ?? String(name),
              ]}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                type="monotone"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={{ r: 3, strokeWidth: 0, fill: s.color }}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
