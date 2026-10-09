import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/section";
import { ScreenGallery } from "@/components/tour/screen-gallery";
import { TourVideo } from "@/components/tour/tour-video";
import { SITE } from "@/lib/site";
import { formatTime, stepTimes, TOUR_JOURNEYS, TOUR_SCREENS } from "@/lib/tour";

export const metadata: Metadata = {
  title: "Tour",
  description:
    "Three captioned screen recordings of the main workflows (exploring the dev set, checking a claim, and the LLM evaluation harness with a labelled mock run), plus screenshots of every key feature.",
};

const SPEC = `${SITE.repo}/blob/main/web/e2e/showcase.spec.ts`;

export default function TourPage() {
  return (
    <>
      <PageHeader eyebrow="Tour" title="The site in three short walkthroughs">
        Each recording is a scripted run of the live site with captions on screen, so you can see
        the main workflows without clicking through them. Everything shown is the real app, except
        the LLM results in the third walkthrough: they come from a labelled mock run, because no
        model was called and no API key was entered.
      </PageHeader>

      <div className="mx-auto max-w-6xl space-y-20 px-4 py-12 sm:px-6">
        <nav aria-label="On this page" className="flex flex-wrap gap-2 text-sm">
          {TOUR_JOURNEYS.map((j, i) => (
            <a
              key={j.slug}
              href={`#${j.slug}`}
              className="rounded-full border border-border bg-card px-3 py-1.5 transition-colors hover:border-foreground/30"
            >
              <span className="font-mono text-xs text-muted-foreground tabular">{i + 1}</span>{" "}
              {j.title}
            </a>
          ))}
          <a
            href="#screenshots"
            className="rounded-full border border-border bg-card px-3 py-1.5 transition-colors hover:border-foreground/30"
          >
            Screenshots
          </a>
        </nav>

        {TOUR_JOURNEYS.map((j, i) => {
          const times = stepTimes(j);
          return (
            <section
              key={j.slug}
              id={j.slug}
              aria-labelledby={`${j.slug}-h`}
              className="scroll-mt-24 space-y-6"
            >
              <div className="max-w-3xl space-y-2">
                <p className="font-mono text-xs text-muted-foreground tabular">
                  Walkthrough {i + 1} of {TOUR_JOURNEYS.length}
                </p>
                <h2 id={`${j.slug}-h`} className="text-headline font-medium">
                  {j.title}
                </h2>
                <p
                  id={`${j.slug}-summary`}
                  className="text-lg leading-relaxed text-muted-foreground"
                >
                  {j.summary}
                </p>
              </div>

              {j.mocked && (
                <p className="flex max-w-3xl gap-2.5 rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2 text-sm">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>
                    <span className="font-medium">Mocked AI response for illustration.</span>{" "}
                    <span className="text-muted-foreground">
                      The LLM verdicts in this recording are a seeded mock run file loaded through
                      &ldquo;Load a saved run&rdquo;. No model was called and no key was entered, so
                      its accuracy figures describe the mock, not any real model. With your own key
                      the{" "}
                      <Link href="/evaluation" className="text-foreground underline">
                        LLM evaluation page
                      </Link>{" "}
                      runs the same comparison for real.
                    </span>
                  </span>
                </p>
              )}

              <TourVideo journey={j} times={times} />

              <details className="group max-w-3xl rounded-xl border border-border bg-card/60 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Transcript: what happens on screen
                </summary>
                <ol className="mt-3 space-y-3 text-sm leading-relaxed">
                  {j.steps.map((s, k) => (
                    <li key={s.text}>
                      <p className="font-medium">
                        Step {k + 1}
                        {times ? ` (${formatTime(times[k] ?? 0)})` : ""}. {s.text}
                        {s.badge ? ` [${s.badge}]` : ""}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">{s.detail}</p>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          );
        })}

        <section
          id="screenshots"
          aria-labelledby="screenshots-h"
          className="scroll-mt-24 space-y-6"
        >
          <div className="max-w-3xl space-y-2">
            <h2 id="screenshots-h" className="text-headline font-medium">
              Key features at a glance
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground">
              Desktop screenshots at 1440 by 900 in the light and dark themes, and two at phone
              width. Select one to enlarge it.
            </p>
          </div>
          <ScreenGallery screens={TOUR_SCREENS} />
        </section>

        <section
          aria-labelledby="made-h"
          className="max-w-3xl space-y-3 rounded-2xl border border-border bg-card/60 p-5 sm:p-6"
        >
          <h2 id="made-h" className="font-serif text-2xl font-medium">
            How these were made
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-border">
            <li>
              A Playwright script,{" "}
              <a href={SPEC} className="font-mono text-foreground underline underline-offset-4">
                web/e2e/showcase.spec.ts
              </a>
              , drives Google Chrome through each journey and records it. Run{" "}
              <code className="font-mono text-foreground">pnpm showcase</code> to re-record
              everything; <code className="font-mono text-foreground">pnpm e2e</code> runs the same
              journeys quickly as end-to-end tests.
            </li>
            <li>
              The inputs are fixed: one typed claim, dev claim 752, and the harness&rsquo;s default
              sample (20 claims, seed 42). The mock LLM run is drawn with its own seed (7), so every
              re-recording shows the same thing.
            </li>
            <li>
              Captions, step lists and transcripts come from one file, so they always match. ffmpeg
              turns each recording into an H.264 MP4 for this page and a GIF for the README.
            </li>
            <li>
              Everything else on the site is live: the recordings show the same pages you can visit,
              starting from{" "}
              <Link href="/try" className="text-foreground underline underline-offset-4">
                Try a claim
              </Link>
              .
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
