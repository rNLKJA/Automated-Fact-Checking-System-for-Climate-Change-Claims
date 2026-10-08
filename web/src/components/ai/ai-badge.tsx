import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/** The visible label on every piece of model output. */
export function AiGeneratedBadge({ className, model }: { className?: string; model?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-foreground/35 bg-background px-2 py-0.5 text-[0.7rem] font-medium tracking-wide whitespace-nowrap text-foreground uppercase",
        className,
      )}
    >
      <Sparkles aria-hidden className="size-3" />
      AI-generated
      {model && (
        <span className="font-mono font-normal tracking-normal text-muted-foreground normal-case">
          · {model}
        </span>
      )}
    </span>
  );
}
