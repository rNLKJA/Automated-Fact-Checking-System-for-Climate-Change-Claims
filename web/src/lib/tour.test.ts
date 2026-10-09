import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatTime, MOCK_BADGE, stepTimes, TOUR_JOURNEYS, TOUR_SCREENS } from "./tour";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLIC = path.join(WEB, "public", "showcase");
const DOCS = path.resolve(WEB, "..", "docs", "showcase");
const KB = 1024;
const MB = 1024 * KB;

describe("tour content", () => {
  it("formats step times as m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(8.2)).toBe("0:08");
    expect(formatTime(65.4)).toBe("1:05");
  });

  it("has unique journeys and screenshots", () => {
    expect(new Set(TOUR_JOURNEYS.map((j) => j.slug)).size).toBe(TOUR_JOURNEYS.length);
    expect(new Set(TOUR_JOURNEYS.map((j) => j.file)).size).toBe(TOUR_JOURNEYS.length);
    expect(new Set(TOUR_SCREENS.map((s) => s.file)).size).toBe(TOUR_SCREENS.length);
  });

  it("labels mocked AI output, and only in the mocked journey", () => {
    for (const j of TOUR_JOURNEYS) {
      const badged = j.steps.filter((s) => s.badge);
      if (j.mocked) {
        expect(badged.length).toBeGreaterThan(0);
        expect(badged.every((s) => s.badge === MOCK_BADGE)).toBe(true);
      } else {
        expect(badged).toHaveLength(0);
      }
    }
  });

  it("knows when each recorded step starts", () => {
    for (const j of TOUR_JOURNEYS) {
      const t = stepTimes(j);
      expect(t, j.slug).not.toBeNull();
      expect(t).toHaveLength(j.steps.length);
      expect([...(t ?? [])].sort((a, b) => a - b)).toEqual(t);
      expect(j.poster.step).toBeGreaterThanOrEqual(1);
      expect(j.poster.step).toBeLessThanOrEqual(j.steps.length);
    }
  });
});

describe("tour media", () => {
  it("ships each walkthrough as an MP4 with a poster and a caption track", () => {
    for (const j of TOUR_JOURNEYS) {
      const mp4 = path.join(PUBLIC, `${j.file}.mp4`);
      expect(existsSync(mp4), mp4).toBe(true);
      expect(statSync(mp4).size).toBeLessThanOrEqual(8 * MB);
      expect(existsSync(path.join(PUBLIC, `${j.file}.webp`))).toBe(true);
      const vtt = readFileSync(path.join(PUBLIC, `${j.file}.vtt`), "utf8");
      expect(vtt.startsWith("WEBVTT")).toBe(true);
      expect(vtt.match(/-->/g)).toHaveLength(j.steps.length);
      if (j.mocked) expect(vtt).toContain(MOCK_BADGE);
      const gif = path.join(DOCS, `${j.file}.gif`);
      expect(existsSync(gif), gif).toBe(true);
      expect(statSync(gif).size).toBeLessThanOrEqual(8 * MB);
    }
  });

  it("ships every screenshot for the site and the README", () => {
    for (const s of TOUR_SCREENS) {
      for (const f of [`${s.file}.webp`, `${s.file}-thumb.webp`]) {
        expect(existsSync(path.join(PUBLIC, "screens", f)), f).toBe(true);
      }
      const png = path.join(DOCS, `${s.file}.png`);
      expect(existsSync(png), png).toBe(true);
      expect(statSync(png).size).toBeLessThan(600 * KB);
    }
  });
});
