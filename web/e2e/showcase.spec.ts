import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

import type { HarnessClaim } from "../src/lib/evaluation/harness";
import { MOCK_BADGE, TOUR_JOURNEYS, TOUR_SCREENS, type TourJourney } from "../src/lib/tour";
import { buildMockRun, MOCK_MODEL } from "./showcase/mock-run";
import {
  caption,
  hideCursor,
  humanClick,
  installOverlay,
  pause,
  pointAt,
  RECORDING,
  scrollBy,
  scrollToTarget,
} from "./showcase/overlay";

/**
 * The showcase tour: three recorded journeys and the key-feature screenshots.
 *
 *   pnpm e2e        quick end-to-end run of the same journeys (no media)
 *   pnpm showcase   paced recordings + screenshots, then scripts/showcase-media.mjs
 *
 * Deterministic inputs: a fixed claim to type, dev claim 752, the harness's
 * default sample (N = 20, seed 42) and a seeded MOCK LLM run. No API key is
 * ever entered: the AI settings dialog is only opened and closed, and the
 * "LLM" results are a mocked run file loaded through "Load a saved run",
 * captioned as a mocked AI response for illustration.
 */

const RAW = path.join(__dirname, "..", ".showcase");
const VIDEO = { width: 1280, height: 800 };
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const TYPED_CLAIM = "Sea levels are rising faster than ever because glaciers are melting.";
const FEATURED_CLAIM = "claim-752";

test.describe.configure({ mode: "serial" });

async function devSet(context: BrowserContext, baseURL: string): Promise<HarnessClaim[]> {
  const res = await context.request.get(new URL("/api/dev-set", baseURL).toString());
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { claims: HarnessClaim[] }).claims;
}

type Journey = {
  journey: TourJourney;
  context: BrowserContext;
  page: Page;
  openedAt: number;
  /** when each step's caption appeared (epoch ms) */
  marks: number[];
};

/** One context per journey; recorded to .showcase/raw when SHOWCASE_RECORD=1. */
async function startJourney(browser: Browser, journey: TourJourney): Promise<Journey> {
  const options: BrowserContextOptions = { viewport: VIDEO, deviceScaleFactor: 1 };
  if (RECORDING) options.recordVideo = { dir: path.join(RAW, "raw"), size: VIDEO };
  const context = await browser.newContext(options);
  await installOverlay(context);
  const page = await context.newPage();
  return { journey, context, page, openedAt: Date.now(), marks: [] };
}

/**
 * Close the context and keep its video under a stable name, with a sidecar
 * saying when each caption appeared: the media script trims the blank page
 * load before the first one and writes the caption track and step times.
 */
async function finishJourney(j: Journey) {
  await caption(j.page, null, 300);
  const video = j.page.video();
  await j.context.close();
  if (!video) return;
  expect(j.marks).toHaveLength(j.journey.steps.length);
  const dir = path.join(RAW, "videos");
  await mkdir(dir, { recursive: true });
  await video.saveAs(path.join(dir, `${j.journey.file}.webm`));
  const steps = j.marks.map((m) => m - j.openedAt);
  await writeFile(
    path.join(dir, `${j.journey.file}.json`),
    JSON.stringify(
      {
        slug: j.journey.slug,
        trimStartMs: Math.max(0, steps[0] - 400),
        stepsMs: steps,
        // a moment into the key step, once its scroll has settled
        posterMs: steps[j.journey.poster.step - 1] + j.journey.poster.afterMs,
        captions: j.journey.steps.map((s) => (s.badge ? `[${s.badge}] ${s.text}` : s.text)),
      },
      null,
      2,
    ),
  );
}

/** Show step `n` (1-based) of the journey's captions, then hold it. */
async function say(j: Journey, n: number, hold?: number, place?: "bottom" | "left") {
  const step = j.journey.steps[n - 1];
  if (!step) throw new Error(`${j.journey.slug} has no step ${n}`);
  // showing a step again (e.g. to move its caption) keeps its original start time
  j.marks[n - 1] ??= Date.now();
  await caption(
    j.page,
    { step: n, of: j.journey.steps.length, text: step.text, badge: step.badge, place },
    hold,
  );
}

async function ready(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

// --------------------------------------------------------------------- journeys

test("journey 1: explore the dev set", async ({ browser }) => {
  const j = await startJourney(browser, TOUR_JOURNEYS[0]);
  const { page } = j;
  await page.goto("/explore");
  await ready(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("154 claims");
  await pause(page, 900);

  await say(j, 1);
  await scrollBy(page, 330, 1600);
  await pointAt(page, page.getByText("Claims with any gold passage found"), 1800);

  await say(j, 2);
  await humanClick(page, page.getByText("Found gold", { exact: true }));
  await expect(page.getByText(/^\d+ of 154 claims$/)).toHaveText(/^(1[0-9]|[1-9]) of 154 claims$/);
  await pause(page, 1600);

  await say(j, 3);
  const row = page.locator(`a[href="/explore/${FEATURED_CLAIM}"]`);
  await humanClick(page, row);
  await page.waitForURL(`**/explore/${FEATURED_CLAIM}`);
  await ready(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await pause(page, 1400);

  await say(j, 4);
  await scrollToTarget(page, page.locator("#verdicts"), 84, 1500);
  await pointAt(page, page.getByText("Notebook protocol").first(), 1600).catch(() => undefined);
  await pause(page, 1200);

  await say(j, 5);
  await scrollToTarget(page, page.locator("#evidence"), 84, 1500);
  await scrollBy(page, 220, 1800);

  await say(j, 6);
  const tabs = page.getByRole("tab");
  await expect(tabs.first()).toBeVisible();
  await humanClick(page, tabs.nth(1));
  await pause(page, 1800);
  await humanClick(page, tabs.nth(0));
  await pause(page, 1600);
  await finishJourney(j);
});

test("journey 2: check a claim", async ({ browser }) => {
  const j = await startJourney(browser, TOUR_JOURNEYS[1]);
  const { page } = j;
  await page.goto("/try");
  await ready(page);
  await pause(page, 900);

  await say(j, 1);
  const box = page.getByLabel("Your claim");
  await humanClick(page, box);
  await box.pressSequentially(TYPED_CLAIM, { delay: RECORDING ? 42 : 0 });
  await pause(page, 900);

  await say(j, 2);
  await humanClick(page, page.getByRole("button", { name: /Check this claim/ }));
  const verdict = page.getByText("The 2024 model’s verdict");
  await expect(verdict).toBeVisible();
  await pause(page, 800);

  await say(j, 3);
  await pointAt(page, page.locator("#verdict-h"), 1400);
  await pointAt(page, page.getByText(/95% CI/).first(), 2200);

  await say(j, 4);
  await scrollToTarget(page, page.locator("#evidence-h"), 84, 1600);
  await scrollBy(page, 260, 1800);

  await say(j, 5);
  await scrollToTarget(page, page.locator("#hood-h"), 84, 1800);
  await scrollBy(page, 420, 2200);

  await say(j, 6);
  await scrollToTarget(page, page.getByText("Or start from an example"), 110, 1400);
  await humanClick(page, page.locator("form ul li button").first());
  await expect(verdict).toBeVisible();
  await pause(page, 900);
  await scrollToTarget(page, page.locator("#verdict-h"), 110, 1600);
  await pointAt(
    page,
    page.getByText("Same passages as the full 2024 search.", { exact: true }),
    2600,
  );
  await finishJourney(j);
});

test("journey 3: original model vs LLM (mocked run)", async ({ browser, baseURL }) => {
  const j = await startJourney(browser, TOUR_JOURNEYS[2]);
  const { context, page } = j;
  const run = buildMockRun(await devSet(context, baseURL!));
  await page.goto("/evaluation");
  await ready(page);
  await pause(page, 900);

  await say(j, 1);
  await scrollToTarget(page, page.locator("#protocol"), 84, 2600);

  await say(j, 2);
  const setup = page.getByRole("heading", { name: "Run the comparison" });
  await scrollToTarget(page, setup, 96, 1200);
  await humanClick(page, page.getByRole("button", { name: "Add key" }));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // park the caption beside the dialog so it covers none of it
  await say(j, 2, 900, "left");
  await pointAt(page, dialog.getByText("OpenAI"), 900);
  await pointAt(page, dialog.getByText(/sessionStorage/), 2000);

  await say(j, 3, undefined, "left");
  await humanClick(page, dialog.getByRole("button", { name: "Cancel" }));
  await expect(dialog).toBeHidden();
  await pause(page, 600);

  await say(j, 4, 1600);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    humanClick(page, page.getByRole("button", { name: "Load a saved run" })),
  ]);
  await chooser.setFiles({
    name: "mocked-llm-run.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(run, null, 2)),
  });
  const results = page.getByRole("heading", { name: "Results", exact: true });
  await expect(results).toBeVisible();
  await expect(page.getByText(MOCK_MODEL).first()).toBeVisible();
  await pause(page, 1000);

  await say(j, 5, 400);
  await scrollToTarget(page, results, 84, 2400);
  await scrollBy(page, 360, 2600);

  await say(j, 6, 400);
  await scrollToTarget(page, page.getByRole("heading", { name: "Claim by claim" }), 84, 2600);
  await scrollBy(page, 300, 2200);
  await finishJourney(j);
});

// ------------------------------------------------------------------ screenshots

const SCREEN_NAMES = new Set(TOUR_SCREENS.map((s) => s.file));

async function shot(page: Page, name: string) {
  // every screenshot is listed in src/lib/tour.ts, which /tour and the README follow
  expect(SCREEN_NAMES.has(name), `${name} is listed in TOUR_SCREENS`).toBe(true);
  await mkdir(path.join(RAW, "screens"), { recursive: true });
  await hideCursor(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(RAW, "screens", `${name}.png`) });
}

async function scrollTo(page: Page, selector: string, offset = 72) {
  await page
    .locator(selector)
    .first()
    .evaluate((el, off) => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off });
    }, offset);
  await page.waitForTimeout(300);
}

test("screenshots: desktop", async ({ browser, baseURL }) => {
  test.skip(!RECORDING, "screenshots are taken by `pnpm showcase`");
  for (const scheme of ["light", "dark"] as const) {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto("/");
    await ready(page);
    await shot(page, scheme === "light" ? "01-landing-light" : "02-landing-dark");
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: "light" });
  await installOverlay(ctx);
  const page = await ctx.newPage();

  await page.goto(`/try?claim=${encodeURIComponent(TYPED_CLAIM)}`);
  await expect(page.getByText("The 2024 model’s verdict")).toBeVisible();
  await ready(page);
  await scrollTo(page, "main form", 96);
  await shot(page, "03-try-verdict");
  await scrollTo(page, "#evidence-h");
  await shot(page, "04-try-evidence");

  await page.goto("/explore");
  await ready(page);
  await shot(page, "05-explore-dev-set");

  await page.goto(`/explore/${FEATURED_CLAIM}`);
  await ready(page);
  await scrollTo(page, "#evidence");
  await shot(page, "06-claim-evidence");

  await page.goto("/results");
  await ready(page);
  await scrollTo(page, "#uncertainty");
  await shot(page, "07-results-uncertainty");

  await page.goto("/method");
  await ready(page);
  await scrollTo(page, "#step-3", 110);
  await shot(page, "08-pipeline-walkthrough");

  await page.goto("/evaluation");
  await ready(page);
  await page.getByRole("button", { name: "Add key" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "09-byok-settings");
  await page.keyboard.press("Escape");

  const run = buildMockRun(await devSet(ctx, baseURL!));
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Load a saved run" }).click(),
  ]);
  await chooser.setFiles({
    name: "mocked-llm-run.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(run)),
  });
  const results = page.getByRole("heading", { name: "Results", exact: true });
  await expect(results).toBeVisible();
  await page.waitForTimeout(1500); // the overlay mounts shortly after load
  await caption(
    page,
    { badge: MOCK_BADGE, text: "Seeded mock run, no model called: the layout only" },
    0,
  );
  await scrollTo(page, "h2:text-is('Results')", 72);
  await shot(page, "10-llm-eval-mocked");
  await caption(page, null, 0);

  await page.goto("/methods");
  await ready(page);
  await shot(page, "11-methods");

  await page.goto("/methods/model-card");
  await ready(page);
  await shot(page, "12-model-card");
  await ctx.close();
});

test("screenshots: mobile", async ({ browser }) => {
  test.skip(!RECORDING, "screenshots are taken by `pnpm showcase`");
  const ctx = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await ready(page);
  await shot(page, "13-mobile-landing");

  await page.goto(`/try?claim=${encodeURIComponent(TYPED_CLAIM)}`);
  await expect(page.getByText("The 2024 model’s verdict")).toBeVisible();
  await ready(page);
  await page.waitForTimeout(800); // the result scrolls itself into view on narrow screens
  await scrollTo(page, "#verdict-h", 116);
  await shot(page, "14-mobile-try-verdict");
  await ctx.close();
});
