import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite driver: keep it out of the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // The read-only database is opened at runtime by the API route (and any
  // dynamically rendered page), so ship it with every server trace.
  outputFileTracingIncludes: {
    "/**": ["./data/climate.db", "./node_modules/better-sqlite3/prebuilds/linux-x64.node"],
  },
  poweredByHeader: false,
};

export default nextConfig;
