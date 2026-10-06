import { ImageResponse } from "next/og";

export const alt = "Climate Claim Checker: a 2024 COMP90042 fact-checking system, re-run";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STRIPES = [
  "#08306b",
  "#08519c",
  "#2171b5",
  "#4292c6",
  "#6baed6",
  "#9ecae1",
  "#c6dbef",
  "#deebf7",
  "#fee0d2",
  "#fcbba1",
  "#fc9272",
  "#fb6a4a",
  "#ef3b2c",
  "#cb181d",
  "#a50f15",
  "#67000d",
];

const EYEBROW = "COMP90042 · University of Melbourne · 2024";
const TITLE = "Climate Claim Checker";
const SUBTITLE =
  "TF-IDF evidence retrieval and a from-scratch Transformer, faithfully re-run as a web app.";
const CLAIM = "“[South Australia] has the most expensive electricity in the world.”";
const CLAIM_LABEL = "Dev claim 752 · 2 of 2 gold passages found";
const STAT = "0.04299";
const STAT_LABEL = "dev evidence F, reproduced to every digit";

/**
 * The site's fonts (Newsreader + IBM Plex Sans), subset to the glyphs used here. The image is
 * rendered once at build time; if Google Fonts cannot be reached it falls back to the default.
 */
async function googleFont(family: string, weight: number, text: string) {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const [serif, sans, sansMedium] = await Promise.all([
    googleFont("Newsreader", 500, TITLE + CLAIM + STAT),
    googleFont("IBM+Plex+Sans", 400, SUBTITLE + CLAIM_LABEL + STAT_LABEL),
    googleFont("IBM+Plex+Sans", 500, EYEBROW.toUpperCase()),
  ]);
  const fonts = [
    serif && { name: "Newsreader", data: serif, weight: 500 as const, style: "normal" as const },
    sans && { name: "Plex", data: sans, weight: 400 as const, style: "normal" as const },
    sansMedium && {
      name: "Plex",
      data: sansMedium,
      weight: 500 as const,
      style: "normal" as const,
    },
  ].filter((f) => f !== null);
  const serifFamily = serif ? "Newsreader" : undefined;
  const sansFamily = sans ? "Plex" : undefined;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#f6f4ee",
        color: "#13212c",
        fontFamily: sansFamily,
      }}
    >
      <div style={{ display: "flex", height: 24 }}>
        {STRIPES.map((c) => (
          <div key={c} style={{ flex: 1, background: c }} />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "52px 80px 60px",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#56626c",
          }}
        >
          {EYEBROW}
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: serifFamily,
            fontSize: 84,
            lineHeight: 1,
            fontWeight: 500,
            letterSpacing: -1.5,
          }}
        >
          {TITLE}
        </div>
        <div
          style={{ marginTop: 20, fontSize: 30, lineHeight: 1.35, color: "#3b4852", maxWidth: 860 }}
        >
          {SUBTITLE}
        </div>
        <div style={{ display: "flex", marginTop: "auto", gap: 28, alignItems: "stretch" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "22px 28px",
              borderRadius: 18,
              background: "#fbfaf6",
              border: "2px solid #e0dacd",
            }}
          >
            <div style={{ fontSize: 20, color: "#56626c" }}>{CLAIM_LABEL}</div>
            <div style={{ marginTop: 8, fontFamily: serifFamily, fontSize: 32, lineHeight: 1.25 }}>
              {CLAIM}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              width: 300,
              padding: "22px 28px",
              borderRadius: 18,
              background: "#12324a",
              color: "#f6f4ee",
            }}
          >
            <div style={{ fontFamily: serifFamily, fontSize: 64, lineHeight: 1, fontWeight: 500 }}>
              {STAT}
            </div>
            <div style={{ marginTop: 10, fontSize: 20, lineHeight: 1.3, color: "#cfe2f3" }}>
              {STAT_LABEL}
            </div>
          </div>
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
