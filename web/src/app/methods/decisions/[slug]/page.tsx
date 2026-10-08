import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/common/markdown";
import { Eyebrow } from "@/components/common/section";
import { SITE } from "@/lib/site";
import { getDecision, listDecisions } from "@/server/docs";

export function generateStaticParams() {
  return listDecisions().map((d) => ({ slug: d.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/methods/decisions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const d = getDecision(slug);
  return d
    ? { title: `${d.id}: ${d.title}`, description: d.decision }
    : { title: "Decision record not found" };
}

export default async function DecisionPage({ params }: PageProps<"/methods/decisions/[slug]">) {
  const { slug } = await params;
  const d = getDecision(slug);
  if (!d) notFound();
  const all = listDecisions();
  const i = all.findIndex((x) => x.slug === slug);
  const file = `docs/decisions/${d.file}`;
  return (
    <article>
      <div className="border-b border-border/70 bg-card/40">
        <div className="mx-auto max-w-3xl space-y-4 px-4 pt-10 pb-10 sm:px-6 md:pt-14">
          <Link
            href="/methods#decisions"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" /> All decision records
          </Link>
          <Eyebrow>
            Decision record {d.id} · {d.decided}
          </Eyebrow>
          <h1 className="text-headline font-medium md:text-[2.5rem] md:leading-[1.1]">{d.title}</h1>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Markdown>{d.body}</Markdown>
        <nav
          aria-label="Other decision records"
          className="mt-14 flex flex-wrap justify-between gap-3 border-t border-border pt-6 text-sm"
        >
          {i > 0 ? (
            <Link href={`/methods/decisions/${all[i - 1].slug}`} className="hover:underline">
              ← {all[i - 1].id}: {all[i - 1].title}
            </Link>
          ) : (
            <span />
          )}
          {i < all.length - 1 && (
            <Link
              href={`/methods/decisions/${all[i + 1].slug}`}
              className="text-right hover:underline"
            >
              {all[i + 1].id}: {all[i + 1].title} →
            </Link>
          )}
        </nav>
        <p className="mt-6 text-xs text-muted-foreground">
          Source:{" "}
          <a href={`${SITE.repo}/blob/main/${file}`} className="underline underline-offset-4">
            {file}
          </a>
        </p>
      </div>
    </article>
  );
}
