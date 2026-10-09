#!/usr/bin/env node
/**
 * Turn the raw showcase output (.showcase/, written by `pnpm showcase`) into
 * the committed media:
 *
 *   docs/showcase/NN-*.png          optimised screenshots for the README (< 600 KB each)
 *   docs/showcase/N-*.gif           walkthrough GIFs for the README (960 px, <= 8 MB)
 *   web/public/showcase/N-*.mp4     H.264 walkthroughs for /tour (faststart, <= 8 MB)
 *   web/public/showcase/N-*.webp    poster frames for the videos
 *   web/public/showcase/N-*.vtt     caption tracks (one cue per step)
 *   web/src/lib/tour-timings.json   step start times, for the step lists on /tour
 *   web/public/showcase/screens/    WebP screenshots (full size + thumbnails) for /tour
 *
 * Needs ffmpeg and cwebp on PATH. Re-runnable: outputs are overwritten.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(WEB, ".showcase");
const DOCS = path.resolve(WEB, "..", "docs", "showcase");
const PUBLIC = path.join(WEB, "public", "showcase");
const SCREENS = path.join(PUBLIC, "screens");
const TMP = path.join(RAW, "tmp");

const MB = 1024 * 1024;
const PNG_LIMIT = 600 * 1024;
const MEDIA_LIMIT = 8 * MB;

for (const dir of [DOCS, PUBLIC, SCREENS, TMP]) mkdirSync(dir, { recursive: true });

const ffmpeg = (...args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: "inherit",
  });
const cwebp = (...args) => execFileSync("cwebp", ["-quiet", ...args], { stdio: "inherit" });
const size = (f) => statSync(f).size;
const kb = (f) => `${(size(f) / 1024).toFixed(0)} KB`;

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      file,
    ],
    { encoding: "utf8" },
  );
  const [width, height] = out.trim().split(",").map(Number);
  return { width, height };
}

function duration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Number(out.trim());
}

// ------------------------------------------------------------------ screenshots

function optimisePng(src, dest, scaleWidth) {
  const scale = scaleWidth ? [`scale=${scaleWidth}:-1:flags=lanczos`] : [];
  // lossless first, at maximum compression
  ffmpeg(
    "-i",
    src,
    "-vf",
    [...scale, "format=rgb24"].join(","),
    "-compression_level",
    "100",
    "-pred",
    "mixed",
    dest,
  );
  if (size(dest) <= PNG_LIMIT) return "lossless";
  // too big: a 256-colour palette (like pngquant), no dithering so text stays crisp
  ffmpeg(
    "-i",
    src,
    "-filter_complex",
    `${scaleWidth ? `scale=${scaleWidth}:-1:flags=lanczos,` : ""}split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none`,
    "-compression_level",
    "100",
    dest,
  );
  return "palette";
}

const screensDir = path.join(RAW, "screens");
if (existsSync(screensDir)) {
  for (const file of readdirSync(screensDir)
    .filter((f) => f.endsWith(".png"))
    .sort()) {
    const src = path.join(screensDir, file);
    const name = file.replace(/\.png$/, "");
    const { width } = probe(src);
    const mobile = name.includes("mobile");
    // mobile shots are taken at deviceScaleFactor 2, then downscaled to 1.5x
    const target = mobile ? Math.round((width / 2) * 1.5) : undefined;
    const dest = path.join(DOCS, file);
    const mode = optimisePng(src, dest, target);
    // site copies: full size and a thumbnail, as WebP
    const full = path.join(SCREENS, `${name}.webp`);
    const thumb = path.join(SCREENS, `${name}-thumb.webp`);
    cwebp(
      "-q",
      "82",
      "-m",
      "6",
      ...(mobile ? ["-resize", String(target), "0"] : []),
      src,
      "-o",
      full,
    );
    cwebp("-q", "78", "-m", "6", "-resize", mobile ? "390" : "720", "0", src, "-o", thumb);
    console.log(`screen ${name}: png ${kb(dest)} (${mode}), webp ${kb(full)}, thumb ${kb(thumb)}`);
  }
}

// ------------------------------------------------------------------- recordings

function encodeMp4(src, dest, start, crf) {
  ffmpeg(
    "-ss",
    start,
    "-i",
    src,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-r",
    "25",
    "-movflags",
    "+faststart",
    "-an",
    dest,
  );
}

/**
 * GIF for the README: sped up slightly, 960 px wide, one palette per clip, and
 * near-duplicate frames dropped (mpdecimate) with their time kept as a longer
 * frame delay, so idle stretches cost almost nothing.
 */
function encodeGif(src, dest, start, { fps, colors, speed }) {
  const palette = path.join(TMP, "palette.png");
  const base = `setpts=PTS/${speed},fps=${fps},scale=960:-1:flags=lanczos,mpdecimate=hi=768:lo=320:frac=0.5`;
  ffmpeg(
    "-ss",
    start,
    "-i",
    src,
    "-vf",
    `${base},palettegen=max_colors=${colors}:stats_mode=diff`,
    palette,
  );
  ffmpeg(
    "-ss",
    start,
    "-i",
    src,
    "-i",
    palette,
    "-lavfi",
    `${base}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
    "-fps_mode",
    "vfr",
    "-loop",
    "0",
    dest,
  );
}

function vttTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${sec}.${String(ms % 1000).padStart(3, "0")}`;
}

/** slug -> step start times (s); read by src/lib/tour.ts */
const TIMINGS = path.join(WEB, "src", "lib", "tour-timings.json");
const timings = existsSync(TIMINGS) ? JSON.parse(readFileSync(TIMINGS, "utf8")) : {};

const videosDir = path.join(RAW, "videos");
if (existsSync(videosDir)) {
  for (const file of readdirSync(videosDir)
    .filter((f) => f.endsWith(".webm"))
    .sort()) {
    const src = path.join(videosDir, file);
    const name = file.replace(/\.webm$/, "");
    const metaFile = path.join(videosDir, `${name}.json`);
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
    const start = ((meta.trimStartMs ?? 0) / 1000).toFixed(2);

    const mp4 = path.join(PUBLIC, `${name}.mp4`);
    let crf = 28;
    encodeMp4(src, mp4, start, crf);
    while (size(mp4) > MEDIA_LIMIT && crf < 36) {
      crf += 2;
      encodeMp4(src, mp4, start, crf);
    }

    // step start times in the trimmed video, for the caption track and /tour's step list
    const total = duration(mp4);
    const trim = meta.trimStartMs ?? 0;
    const times = (meta.stepsMs ?? []).map((ms) => Math.round((ms - trim) / 100) / 10);
    if (meta.slug && times.length > 0) {
      timings[meta.slug] = times;
      const cues = times.map((t, i) => {
        const end = i + 1 < times.length ? times[i + 1] : total;
        return `${i + 1}\n${vttTime(t)} --> ${vttTime(end)}\nStep ${i + 1} of ${times.length}. ${meta.captions[i]}\n`;
      });
      writeFileSync(path.join(PUBLIC, `${name}.vtt`), `WEBVTT\n\n${cues.join("\n")}`);
    }

    // poster: a frame from the journey's key step, as WebP
    const posterPng = path.join(TMP, `${name}-poster.png`);
    const posterAt = meta.posterMs !== undefined ? (meta.posterMs - trim) / 1000 : total / 3;
    const at = Math.min(Math.max(0, posterAt), total - 0.5).toFixed(2);
    ffmpeg("-ss", at, "-i", mp4, "-frames:v", "1", posterPng);
    const poster = path.join(PUBLIC, `${name}.webp`);
    cwebp("-q", "80", "-m", "6", posterPng, "-o", poster);

    const gif = path.join(DOCS, `${name}.gif`);
    const attempts = [
      { fps: 10, colors: 128, speed: 1.15 },
      { fps: 10, colors: 96, speed: 1.2 },
      { fps: 8, colors: 96, speed: 1.3 },
    ];
    let used;
    for (const a of attempts) {
      encodeGif(src, gif, start, a);
      used = a;
      if (size(gif) <= MEDIA_LIMIT) break;
    }
    const { width, height } = probe(mp4);
    console.log(
      `video ${name}: mp4 ${kb(mp4)} (crf ${crf}, ${width}x${height}, ${duration(mp4).toFixed(1)} s), poster ${kb(poster)}, gif ${kb(gif)} (${used.fps} fps, ${used.colors} colours, x${used.speed})`,
    );
    if (size(mp4) > MEDIA_LIMIT || size(gif) > MEDIA_LIMIT) {
      console.error(`  ${name} is over the 8 MB budget`);
      process.exitCode = 1;
    }
  }
}

writeFileSync(TIMINGS, `${JSON.stringify(timings, null, 2)}\n`);
// keep the generated JSON in the repository's Prettier style
execFileSync("pnpm", ["exec", "prettier", "--write", TIMINGS], { cwd: WEB, stdio: "ignore" });

rmSync(TMP, { recursive: true, force: true });
