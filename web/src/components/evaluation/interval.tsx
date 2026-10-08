import { cn } from "@/lib/utils";

/**
 * A point estimate with its interval on a fixed scale (a one-row forest plot).
 * Decorative: the numbers are always printed next to it, so it is hidden from
 * assistive technology.
 */
export function IntervalBar({
  estimate,
  lower,
  upper,
  min = 0,
  max = 1,
  reference,
  tone = "series-1",
  className,
}: {
  estimate: number;
  lower: number;
  upper: number;
  min?: number;
  max?: number;
  /** a dashed reference line (e.g. a baseline, or 0 for differences) */
  reference?: number;
  tone?: "series-1" | "series-2" | "series-3";
  className?: string;
}) {
  const pos = (x: number) => `${(Math.min(max, Math.max(min, x)) - min) * (100 / (max - min))}%`;
  const color = `var(--${tone})`;
  const ok = Number.isFinite(lower) && Number.isFinite(upper);
  return (
    <div aria-hidden className={cn("relative h-4 w-full", className)}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
      {reference !== undefined && (
        <div
          className="absolute top-0 bottom-0 border-l border-dashed border-foreground/45"
          style={{ left: pos(reference) }}
        />
      )}
      {ok && (
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-35"
          style={{
            left: pos(lower),
            width: `calc(${pos(upper)} - ${pos(lower)})`,
            background: color,
            minWidth: 2,
          }}
        />
      )}
      {Number.isFinite(estimate) && (
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
          style={{ left: pos(estimate), background: color }}
        />
      )}
    </div>
  );
}

/** Small caption for a scale: "0%" … "100%". */
export function ScaleLabels({ left, right }: { left: string; right: string }) {
  return (
    <div
      aria-hidden
      className="flex justify-between font-mono text-[0.65rem] text-muted-foreground tabular"
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}
