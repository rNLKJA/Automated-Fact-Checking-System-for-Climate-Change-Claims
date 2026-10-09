import type { BrowserContext, Locator, Page } from "@playwright/test";

/**
 * Presentation helpers for the recorded tour: an on-screen caption banner, a
 * visible cursor, and human pacing. With SHOWCASE_RECORD unset the same
 * journeys run as quick end-to-end checks (short waits, no video).
 */
export const RECORDING = process.env.SHOWCASE_RECORD === "1";

/** Scale every presentational wait: full length when recording, a fraction otherwise. */
const PACE = RECORDING ? 1 : 0.1;

export type Caption = {
  /** shown as "STEP 2/6"; omitted for a plain label */
  step?: number;
  of?: number;
  text: string;
  /** a red pill shown beside the text, e.g. to label mocked AI output */
  badge?: string;
  /** "left" parks the caption beside a centred dialog instead of under it */
  place?: "bottom" | "left";
};

/**
 * Installed in every page of the context (and again after each full page load):
 * the caption and the cursor survive navigation via sessionStorage.
 */
function overlayScript() {
  const CAPTION = "__showcase_caption";
  const CURSOR = "__showcase_cursor";
  const css = `
#sc-caption{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;
  display:flex;align-items:center;gap:14px;width:max-content;max-width:min(1120px,calc(100vw - 40px));
  padding:12px 20px 12px 14px;border-radius:14px;background:rgba(9,17,26,.93);color:#fff;
  font:500 19px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.005em;
  box-shadow:0 12px 32px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.08);pointer-events:none;
  transition:opacity .3s ease}
#sc-caption[data-empty="true"]{opacity:0}
#sc-caption[data-place="left"]{left:20px;bottom:24px;transform:none;width:auto;max-width:330px;
  flex-direction:column;align-items:flex-start;gap:10px;padding:14px 16px}
#sc-caption .sc-step{flex:none;font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.05em;padding:7px 9px;border-radius:8px;background:#f2c14e;color:#14110a}
#sc-caption .sc-badge{flex:none;font:700 12px/1 system-ui,-apple-system,sans-serif;text-transform:uppercase;
  letter-spacing:.06em;padding:7px 9px;border-radius:8px;background:#d9412b;color:#fff}
#sc-cursor{position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;
  background:rgba(242,193,78,.32);border:2.5px solid rgba(226,110,26,.95);z-index:2147483647;
  pointer-events:none;opacity:0;transition:transform .14s ease,background .14s ease,opacity .2s ease;
  box-shadow:0 0 0 4px rgba(255,255,255,.45)}
#sc-cursor[data-on="true"]{opacity:1}
#sc-cursor[data-down="true"]{transform:scale(.68);background:rgba(226,110,26,.6)}
`;

  function caption(): HTMLElement | null {
    return document.getElementById("sc-caption");
  }
  function cursor(): HTMLElement | null {
    return document.getElementById("sc-cursor");
  }

  function render() {
    const el = caption();
    if (!el) return;
    const raw = sessionStorage.getItem(CAPTION);
    const data = raw ? (JSON.parse(raw) as Caption | null) : null;
    el.replaceChildren();
    el.dataset.empty = data ? "false" : "true";
    el.dataset.place = data?.place ?? "bottom";
    if (!data) return;
    if (data.step) {
      const step = document.createElement("span");
      step.className = "sc-step";
      step.textContent = `STEP ${data.step}/${data.of}`;
      el.append(step);
    }
    if (data.badge) {
      const badge = document.createElement("span");
      badge.className = "sc-badge";
      badge.textContent = data.badge;
      el.append(badge);
    }
    const text = document.createElement("span");
    text.textContent = data.text;
    el.append(text);
  }

  function place(x: number, y: number) {
    const el = cursor();
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.dataset.on = "true";
  }

  function mount() {
    if (!document.body || caption()) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const cap = document.createElement("div");
    cap.id = "sc-caption";
    cap.setAttribute("aria-hidden", "true");
    const cur = document.createElement("div");
    cur.id = "sc-cursor";
    cur.setAttribute("aria-hidden", "true");
    document.body.append(cap, cur);
    render();
    const last = sessionStorage.getItem(CURSOR);
    if (last) {
      const p = JSON.parse(last) as { x: number; y: number };
      place(p.x, p.y);
    }
  }

  (window as unknown as { __showcaseCaption: (c: Caption | null) => void }).__showcaseCaption = (
    c,
  ) => {
    if (c) sessionStorage.setItem(CAPTION, JSON.stringify(c));
    else sessionStorage.removeItem(CAPTION);
    mount();
    render();
  };

  document.addEventListener(
    "mousemove",
    (e) => {
      place(e.clientX, e.clientY);
      sessionStorage.setItem(CURSOR, JSON.stringify({ x: e.clientX, y: e.clientY }));
    },
    { capture: true, passive: true },
  );
  document.addEventListener("mousedown", () => cursor()?.setAttribute("data-down", "true"), true);
  document.addEventListener("mouseup", () => cursor()?.removeAttribute("data-down"), true);

  // after hydration, so React never sees the extra nodes while it hydrates
  if (document.readyState === "complete") setTimeout(mount, 300);
  else window.addEventListener("load", () => setTimeout(mount, 300), { once: true });
}

export async function installOverlay(context: BrowserContext) {
  await context.addInitScript(overlayScript);
}

/** Hide the overlay cursor (for still screenshots). */
export async function hideCursor(page: Page) {
  await page.evaluate(() => document.getElementById("sc-cursor")?.removeAttribute("data-on"));
}

/** Wait for a human-sized moment (shortened when not recording). */
export async function pause(page: Page, ms: number) {
  await page.waitForTimeout(Math.round(ms * PACE));
}

export async function caption(page: Page, c: Caption | null, hold = 2200) {
  await page.evaluate(
    (data) =>
      (window as unknown as { __showcaseCaption?: (c: unknown) => void }).__showcaseCaption?.(data),
    c,
  );
  await pause(page, hold);
}

const cursorAt = new WeakMap<Page, { x: number; y: number }>();

/** Glide the cursor to a point, in small steps so the video shows the movement. */
export async function glide(page: Page, x: number, y: number) {
  const from = cursorAt.get(page) ?? { x: 640, y: 400 };
  const distance = Math.hypot(x - from.x, y - from.y);
  const steps = RECORDING ? Math.max(8, Math.min(40, Math.round(distance / 18))) : 1;
  await page.mouse.move(x, y, { steps });
  cursorAt.set(page, { x, y });
}

/** Below the sticky header and above the caption banner: where a target stays visible. */
const SAFE_TOP = 72;
const SAFE_BOTTOM_MARGIN = 140;

/**
 * Scroll a locator into view clear of the header and the caption banner, glide
 * to its centre and pause.
 */
export async function pointAt(page: Page, target: Locator, settle = 450) {
  await target.waitFor({ state: "visible" });
  let box = await target.boundingBox();
  if (!box) throw new Error("target has no bounding box");
  const height = page.viewportSize()?.height ?? 800;
  const outside = box.y < SAFE_TOP || box.y + box.height > height - SAFE_BOTTOM_MARGIN;
  // a dialog is fixed in place: scrolling would only move the page behind it
  const inDialog = await target.evaluate((el) => el.closest('[role="dialog"]') !== null);
  if (outside && !inDialog) {
    // a smooth scroll that brings the target to about 40% of the viewport height
    await scrollBy(page, box.y + box.height / 2 - height * 0.4, 900);
    box = (await target.boundingBox()) ?? box;
  }
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  await pause(page, settle);
}

/** Glide to a locator and click it like a person would. */
export async function humanClick(page: Page, target: Locator) {
  await pointAt(page, target);
  await target.click({ delay: RECORDING ? 90 : 0 });
  await pause(page, 500);
}

/** Smoothly scroll so the top of a locator sits just below the sticky header. */
export async function scrollToTarget(page: Page, target: Locator, offset = 84, settle = 1200) {
  await target.evaluate((el, off) => {
    const top = el.getBoundingClientRect().top + window.scrollY - off;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, offset);
  await pause(page, settle);
  await scrollSettled(page);
}

/** Resolve once the window has stopped scrolling (a few identical frames in a row). */
async function scrollSettled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = -1;
        let same = 0;
        const tick = () => {
          const y = window.scrollY;
          if (y === last) {
            same += 1;
            if (same > 4) return resolve();
          } else {
            same = 0;
            last = y;
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}

/** Smoothly scroll the window by a number of pixels. */
export async function scrollBy(page: Page, dy: number, settle = 1100) {
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
  await pause(page, settle);
  await scrollSettled(page);
}
