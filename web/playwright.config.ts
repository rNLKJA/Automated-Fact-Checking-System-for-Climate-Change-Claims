import { defineConfig } from "@playwright/test";

/**
 * The showcase tour (`pnpm showcase`) and its end-to-end checks (`pnpm e2e`).
 * Runs against production by default. Set BASE_URL=http://localhost:3309 to tour
 * a local production build (`pnpm build` first); Playwright starts and stops it.
 * Uses the installed Google Chrome (channel "chrome"): no browser downloads.
 */
const BASE_URL = process.env.BASE_URL ?? "https://comp90042-climate-fact-check.vercel.app";
const local = new URL(BASE_URL);
const LOCAL = ["localhost", "127.0.0.1"].includes(local.hostname);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./.showcase/test-results",
  // recordings pace themselves for a human viewer, so they take a while
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // a local BASE_URL serves the production build (`pnpm build` first)
  webServer: LOCAL
    ? {
        command: `pnpm exec next start -p ${local.port || "3309"}`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    headless: true,
    locale: "en-AU",
    timezoneId: "Australia/Adelaide",
    colorScheme: "light",
    trace: "off",
    video: "off",
  },
});
