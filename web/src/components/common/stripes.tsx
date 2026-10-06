import { cn } from "@/lib/utils";

const STEPS = Array.from(
  { length: 16 },
  (_, i) => `var(--stripe-${String(i + 1).padStart(2, "0")})`,
);

/**
 * A decorative band in the warming-stripes palette, cold to warm. It is a
 * colour scale, not data, so it is hidden from assistive technology.
 */
export function Stripes({ className, count = 32 }: { className?: string; count?: number }) {
  const cells = Array.from({ length: count }, (_, i) => STEPS[Math.round((i / (count - 1)) * 15)]);
  return (
    <div aria-hidden className={cn("flex w-full overflow-hidden", className)}>
      {cells.map((c, i) => (
        <span key={i} className="h-full flex-1" style={{ background: c }} />
      ))}
    </div>
  );
}

/** Eight-bar mark used in the wordmark. */
export function StripesMark({ className }: { className?: string }) {
  const marks = [1, 3, 5, 7, 10, 12, 14, 16].map(
    (n) => `var(--stripe-${String(n).padStart(2, "0")})`,
  );
  return (
    <span
      aria-hidden
      className={cn("inline-flex h-5 w-6 overflow-hidden rounded-[3px]", className)}
    >
      {marks.map((c, i) => (
        <span key={i} className="h-full flex-1" style={{ background: c }} />
      ))}
    </span>
  );
}
