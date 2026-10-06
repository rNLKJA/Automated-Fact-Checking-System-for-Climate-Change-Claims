import { cn } from "@/lib/utils";

/** Stemmed tags as small mono chips; tags shared with the claim are emphasised. */
export function TagChips({
  tags,
  matched,
  className,
  label = "Tags",
}: {
  tags: readonly string[];
  matched?: ReadonlySet<string>;
  className?: string;
  label?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label={label} className={cn("flex flex-wrap gap-1", className)}>
      {tags.map((t, i) => {
        const hit = matched?.has(t);
        return (
          <li
            key={`${t}-${i}`}
            className={cn(
              "rounded-[5px] px-1.5 py-0.5 font-mono text-[0.72rem] leading-tight",
              hit
                ? "bg-series-1/15 font-medium text-foreground ring-1 ring-series-1/40 ring-inset"
                : "bg-muted text-muted-foreground",
            )}
          >
            {t}
            {hit && <span className="sr-only"> (shared with the claim)</span>}
          </li>
        );
      })}
    </ul>
  );
}
