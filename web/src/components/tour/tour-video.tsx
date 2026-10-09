"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatTime, type TourJourney } from "@/lib/tour";
import { cn } from "@/lib/utils";

/**
 * One recorded walkthrough: the video (its file is only requested once the
 * player is near the viewport), a step list that seeks the video and follows
 * it while it plays, and the caption track.
 */
export function TourVideo({
  journey,
  times,
}: {
  journey: TourJourney;
  /** start time (s) of each step, when the recording's timings are known */
  times: readonly number[] | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const base = `/showcase/${journey.file}`;

  // lazy-load: attach the source only when the player is about to scroll into view
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // highlight the step that is on screen
  useEffect(() => {
    const el = ref.current;
    if (!el || !times) return;
    const onTime = () => {
      let k: number | null = null;
      times.forEach((t, i) => {
        if (el.currentTime >= t - 0.05) k = i;
      });
      setActive(k);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeked", onTime);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeked", onTime);
    };
  }, [times]);

  function seek(i: number) {
    const el = ref.current;
    if (!el || !times) return;
    setNear(true);
    const go = () => {
      el.currentTime = times[i] ?? 0;
      void el.play().catch(() => undefined);
    };
    if (el.readyState >= 1) go();
    else el.addEventListener("loadedmetadata", go, { once: true });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:items-start">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_var(--border),0_24px_48px_-32px_color-mix(in_oklab,var(--foreground)_30%,transparent)]">
        <video
          ref={ref}
          src={near ? `${base}.mp4` : undefined}
          poster={`${base}.webp`}
          controls
          muted
          playsInline
          preload="metadata"
          width={1280}
          height={800}
          aria-label={`${journey.title}: screen recording with on-screen captions`}
          aria-describedby={`${journey.slug}-summary`}
          className="block aspect-[16/10] h-auto w-full bg-muted"
        >
          <track kind="captions" src={`${base}.vtt`} srcLang="en" label="English (step captions)" />
          Your browser cannot play this video.{" "}
          <a href={`${base}.mp4`} className="underline">
            Download the MP4
          </a>
          .
        </video>
      </div>

      <ol className="space-y-1.5" aria-label={`${journey.title}: steps`}>
        {journey.steps.map((step, i) => {
          const current = active === i;
          const t = times?.[i];
          return (
            <li key={step.text} aria-current={current ? "step" : undefined}>
              <button
                type="button"
                onClick={() => seek(i)}
                disabled={!times}
                className={cn(
                  "group grid w-full grid-cols-[1.75rem_1fr] gap-x-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors enabled:hover:bg-accent/60 disabled:cursor-default",
                  current && "bg-accent text-accent-foreground",
                )}
              >
                <span
                  className={cn(
                    "mt-px grid size-6 place-items-center rounded-full border font-mono text-xs tabular",
                    current
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="leading-snug">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.badge && (
                    <span className="mr-1.5 inline-block rounded bg-destructive px-1.5 py-0.5 align-[1px] text-[0.65rem] font-semibold tracking-wide text-white uppercase">
                      Mocked
                    </span>
                  )}
                  {step.text}
                  {t !== undefined && (
                    <span className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground tabular">
                      <Play aria-hidden className="size-3" />
                      <span className="sr-only">Play from </span>
                      {formatTime(t)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
