import Link from "next/link";

import { Stripes } from "@/components/common/stripes";
import { SITE, TEAM } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <Stripes className="h-1.5 opacity-80" count={48} />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-serif text-lg font-semibold">Climate Claim Checker</p>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            A {SITE.subject.code} {SITE.subject.name} group project from {SITE.university},{" "}
            {SITE.term}. The original submission is preserved unchanged in the repository&rsquo;s{" "}
            <code className="font-mono text-[0.85em]">coursework/</code> folder.
          </p>
        </div>
        <div>
          <p className="mb-3 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Team
          </p>
          <ul className="space-y-1.5 text-sm">
            {TEAM.map((m) => (
              <li key={m.name}>{m.name}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Links
          </p>
          <ul className="space-y-1.5 text-sm">
            <li>
              <a className="underline-offset-4 hover:underline" href={SITE.repo}>
                Source code on GitHub
              </a>
            </li>
            <li>
              <a className="underline-offset-4 hover:underline" href={SITE.courseRepo}>
                Course project brief (public)
              </a>
            </li>
            <li>
              <Link className="underline-offset-4 hover:underline" href="/method#data">
                Data &amp; provenance
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
