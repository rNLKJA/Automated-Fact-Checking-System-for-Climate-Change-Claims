import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { headingId, resolveDocHref } from "@/lib/docs";
import { cn } from "@/lib/utils";

function text(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(text).join("");
  if (children && typeof children === "object" && "props" in children) {
    return text((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

const components: Components = {
  h2: ({ children }) => (
    <h2
      id={headingId(text(children))}
      className="mt-12 scroll-mt-24 text-2xl font-medium text-foreground first:mt-0"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={headingId(text(children))} className="mt-8 scroll-mt-24 text-xl font-medium">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mt-4 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed marker:text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 leading-relaxed">{children}</ol>
  ),
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  ),
  a: ({ href = "", children }) => {
    const to = resolveDocHref(href);
    const cls = "text-foreground underline underline-offset-4";
    return to.startsWith("/") || to.startsWith("#") ? (
      <Link href={to} className={cls}>
        {children}
      </Link>
    ) : (
      <a href={to} className={cls} rel="noreferrer">
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div
      className="mt-5 overflow-x-auto rounded-xl border border-border bg-card"
      role="region"
      aria-label="Table"
      tabIndex={0}
    >
      <table className="w-full min-w-[34rem] text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border text-xs text-muted-foreground">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-border/70">{children}</tbody>,
  th: ({ children, style }) => (
    <th scope="col" className="px-4 py-2.5 font-medium" style={style}>
      {children}
    </th>
  ),
  td: ({ children, style }) => {
    // keep short numeric cells ("−14.3 to +2.6 pp", "[0.020, 0.069]") on one line
    const t = text(children);
    const numeric = t.length <= 28 && /\d/.test(t);
    return (
      <td
        className={cn("px-4 py-2.5 align-top tabular", numeric && "whitespace-nowrap")}
        style={style}
      >
        {children}
      </td>
    );
  },
};

/** Renders one of the repository's markdown documents in the site's editorial style. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-[1.02rem] text-muted-foreground", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
