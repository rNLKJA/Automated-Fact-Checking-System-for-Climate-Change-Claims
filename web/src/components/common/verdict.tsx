import { CircleCheck, CircleQuestionMark, CircleX, Scale, type LucideIcon } from "lucide-react";

import { LABEL_TEXT, LABELS, type Label } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const VERDICT_STYLE: Record<
  Label,
  { icon: LucideIcon; color: string; tint: string; varName: string }
> = {
  SUPPORTS: {
    icon: CircleCheck,
    color: "text-supports",
    tint: "bg-supports/12 ring-supports/35",
    varName: "var(--verdict-supports)",
  },
  REFUTES: {
    icon: CircleX,
    color: "text-refutes",
    tint: "bg-refutes/12 ring-refutes/35",
    varName: "var(--verdict-refutes)",
  },
  NOT_ENOUGH_INFO: {
    icon: CircleQuestionMark,
    color: "text-nei",
    tint: "bg-nei/12 ring-nei/40",
    varName: "var(--verdict-nei)",
  },
  DISPUTED: {
    icon: Scale,
    color: "text-disputed",
    tint: "bg-disputed/12 ring-disputed/35",
    varName: "var(--verdict-disputed)",
  },
};

/** Verdict chip: coloured icon + ink text, never colour alone. */
export function VerdictBadge({
  label,
  size = "md",
  className,
  prefix,
}: {
  label: Label;
  size?: "sm" | "md" | "lg";
  className?: string;
  prefix?: string;
}) {
  const s = VERDICT_STYLE[label];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        s.tint,
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-2.5 py-1 text-sm",
        size === "lg" && "px-3.5 py-1.5 text-base",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(s.color, size === "lg" ? "size-5" : size === "md" ? "size-4" : "size-3.5")}
      />
      {prefix && <span className="text-muted-foreground">{prefix}</span>}
      <span>{LABEL_TEXT[label].short}</span>
    </span>
  );
}

/** Horizontal probability bars for the four verdicts, each labelled with its value. */
export function ProbabilityBars({
  probs,
  highlight,
  className,
}: {
  probs: readonly number[];
  highlight?: Label;
  className?: string;
}) {
  return (
    <dl className={cn("space-y-2", className)}>
      {LABELS.map((label, k) => {
        const p = probs[k] ?? 0;
        const s = VERDICT_STYLE[label];
        const Icon = s.icon;
        return (
          <div
            key={label}
            className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-3 text-sm"
          >
            <dt
              className={cn(
                "flex items-center gap-1.5",
                highlight === label ? "font-medium" : "text-muted-foreground",
              )}
            >
              <Icon aria-hidden className={cn("size-3.5", s.color)} />
              {LABEL_TEXT[label].short}
            </dt>
            <dd className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(p * 100, 0.5)}%`, background: s.varName }}
              />
            </dd>
            <dd className="text-right font-mono text-xs tabular">{(p * 100).toFixed(1)}%</dd>
          </div>
        );
      })}
    </dl>
  );
}
