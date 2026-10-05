import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  id,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl space-y-3", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="scroll-mt-24 text-headline font-medium">
        {title}
      </h2>
      {children && <div className="text-lg leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="border-b border-border/70 bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-12 pb-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-end md:pt-16">
        <div className="max-w-3xl space-y-4">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="text-headline font-medium md:text-[2.75rem] md:leading-[1.08]">{title}</h1>
          {children && (
            <div className="text-lg leading-relaxed text-muted-foreground">{children}</div>
          )}
        </div>
        {aside}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-4xl font-medium tracking-tight tabular">{value}</p>
      {note && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

export function Callout({
  title,
  children,
  icon,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex gap-3 rounded-xl border border-border bg-accent/50 p-4 text-sm leading-relaxed",
        className,
      )}
    >
      {icon && <div className="mt-0.5 shrink-0 text-accent-foreground">{icon}</div>}
      <div className="space-y-1">
        {title && <p className="font-medium text-foreground">{title}</p>}
        <div className="text-muted-foreground">{children}</div>
      </div>
    </aside>
  );
}
