import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { SITE } from "@/lib/site";
import { Markdown } from "./markdown";
import { Eyebrow } from "./section";

/** A repository markdown document rendered as a page under /methods. */
export function DocPage({
  eyebrow,
  doc,
  source,
}: {
  eyebrow: string;
  doc: { title: string; body: string };
  source: string;
}) {
  return (
    <article>
      <div className="border-b border-border/70 bg-card/40">
        <div className="mx-auto max-w-3xl space-y-4 px-4 pt-10 pb-10 sm:px-6 md:pt-14">
          <Link
            href="/methods#cards"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" /> Methods &amp; decisions
          </Link>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="text-headline font-medium md:text-[2.5rem] md:leading-[1.1]">
            {doc.title}
          </h1>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Markdown>{doc.body}</Markdown>
        <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          Source:{" "}
          <a href={`${SITE.repo}/blob/main/${source}`} className="underline underline-offset-4">
            {source}
          </a>
        </p>
      </div>
    </article>
  );
}
