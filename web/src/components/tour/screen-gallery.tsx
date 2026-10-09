"use client";

import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { TourScreen } from "@/lib/tour";
import { cn } from "@/lib/utils";

const src = (s: TourScreen, thumb = false) =>
  `/showcase/screens/${s.file}${thumb ? "-thumb" : ""}.webp`;

/** Thumbnails that open a lightbox; arrow keys step through the screenshots. */
export function ScreenGallery({ screens }: { screens: readonly TourScreen[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const desktop = screens.flatMap((s, i) => (s.mobile ? [] : [{ s, i }]));
  const phone = screens.flatMap((s, i) => (s.mobile ? [{ s, i }] : []));
  const current = open === null ? null : screens[open];
  const step = (d: number) =>
    setOpen((o) => (o === null ? o : (o + d + screens.length) % screens.length));

  const tile = ({ s, i }: { s: TourScreen; i: number }) => (
    <li key={s.file}>
      <figure className="space-y-2">
        <button
          type="button"
          onClick={() => setOpen(i)}
          aria-label={`Enlarge screenshot: ${s.title}`}
          className="group relative block w-full overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30"
        >
          <Image
            src={src(s, true)}
            alt={`${s.title}: ${s.caption}`}
            width={s.mobile ? 390 : 720}
            height={s.mobile ? 844 : 450}
            sizes={
              s.mobile
                ? "(min-width: 640px) 25vw, 50vw"
                : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            }
            loading="lazy"
            unoptimized
            className="h-auto w-full"
          />
          <span
            aria-hidden
            className="absolute top-2 right-2 grid size-8 place-items-center rounded-md bg-background/85 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <Expand className="size-4" />
          </span>
        </button>
        <figcaption className="text-sm leading-snug">
          <span className="font-medium">{s.title}.</span>{" "}
          <span className="text-muted-foreground">{s.caption}</span>
        </figcaption>
      </figure>
    </li>
  );

  return (
    <>
      <ul className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">{desktop.map(tile)}</ul>
      {phone.length > 0 && (
        <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4">{phone.map(tile)}</ul>
      )}

      <Dialog open={current !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent
          className={cn(
            "gap-4 p-3 sm:p-4",
            current?.mobile
              ? "max-w-[min(26rem,calc(100%-1.5rem))]"
              : "max-w-[min(76rem,calc(100%-1.5rem))]",
          )}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") step(1);
            if (e.key === "ArrowLeft") step(-1);
          }}
        >
          {current && open !== null && (
            <>
              <div className="pr-10">
                <DialogTitle className="text-xl">{current.title}</DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  {current.caption}{" "}
                  <span className="tabular">
                    ({open + 1} of {screens.length})
                  </span>
                </DialogDescription>
              </div>
              <Image
                key={current.file}
                src={src(current)}
                alt={`${current.title}: ${current.caption}`}
                width={current.width}
                height={current.height}
                unoptimized
                className="mx-auto h-auto max-h-[calc(100dvh-11rem)] w-auto max-w-full rounded-lg border border-border"
              />
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => step(-1)}>
                  <ChevronLeft aria-hidden /> Previous
                </Button>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Use the arrow keys to move between screenshots
                </p>
                <Button variant="outline" size="sm" onClick={() => step(1)}>
                  Next <ChevronRight aria-hidden />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
