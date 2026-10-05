import Link from "next/link";

import { StripesMark } from "@/components/common/stripes";
import { NAV, SITE } from "@/lib/site";
import { MainNav, MobileNav } from "./main-nav";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-md"
          aria-label={`${SITE.name}, home`}
        >
          <StripesMark />
          <span className="font-serif text-[1.05rem] font-semibold tracking-tight">
            Climate Claim Checker
          </span>
        </Link>
        <MainNav items={NAV} />
        <div className="ml-auto flex items-center gap-1">
          <a
            href={SITE.repo}
            className="hidden rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
          >
            GitHub
          </a>
          <ThemeToggle />
          <MobileNav items={NAV} />
        </div>
      </div>
    </header>
  );
}
