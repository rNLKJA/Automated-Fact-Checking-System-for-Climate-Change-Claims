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

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#f6f4ee",
        color: "#13212c",
      }}
    >
      <div style={{ display: "flex", height: 28 }}>
        {STRIPES.map((c) => (
          <div key={c} style={{ flex: 1, background: c }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: "72px 80px", gap: 28 }}>
        <div
          style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: "#56626c" }}
        >
          COMP90042 · University of Melbourne · 2024
        </div>
        <div style={{ fontSize: 76, lineHeight: 1.05, fontWeight: 600, maxWidth: 980 }}>
          Climate Claim Checker
        </div>
        <div style={{ fontSize: 34, lineHeight: 1.35, color: "#3b4852", maxWidth: 940 }}>
          TF-IDF evidence retrieval and a from-scratch Transformer, faithfully re-run as a web app.
        </div>
      </div>
    </div>,
    size,
  );
}
