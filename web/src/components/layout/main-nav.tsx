"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav({ items }: { items: readonly Item[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileNav({ items }: { items: readonly Item[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X aria-hidden /> : <Menu aria-hidden />}
      </Button>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="absolute inset-x-0 top-14 border-b border-border bg-background px-4 pb-4 shadow-sm"
        >
          <ul className="flex flex-col gap-1 pt-2">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-base hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={SITE.repo}
                className="block rounded-md px-3 py-2.5 text-base text-muted-foreground hover:bg-accent"
              >
                GitHub repository
              </a>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
