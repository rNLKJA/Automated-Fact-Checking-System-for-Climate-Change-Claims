import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Card wrapper: title, one-line takeaway, controls row, the plot and a source note. */
export function ChartFrame({
  title,
  takeaway,
  controls,
  children,
  source,
  className,
  id,
}: {
  title: string;
  takeaway?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  source?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <figure
      id={id}
      className={cn(
        "scroll-mt-24 space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6",
        className,
      )}
    >
      <div className="space-y-1">
        <h3 className="font-serif text-xl font-medium">{title}</h3>
        {takeaway && (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{takeaway}</p>
        )}
      </div>
      {controls && <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{controls}</div>}
      {children}
      {source && (
        <figcaption className="text-xs leading-relaxed text-muted-foreground">{source}</figcaption>
      )}
    </figure>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="inline-flex flex-wrap rounded-lg border border-border bg-background p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm transition-colors",
              value === o.value
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Legend item: a short line/swatch sample + ink text (identity never by colour alone). */
export function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <svg width="22" height="8" aria-hidden>
        <line
          x1="1"
          y1="4"
          x2="21"
          y2="4"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={dashed ? "4 3" : undefined}
          strokeLinecap="round"
        />
      </svg>
      {label}
    </span>
  );
}
