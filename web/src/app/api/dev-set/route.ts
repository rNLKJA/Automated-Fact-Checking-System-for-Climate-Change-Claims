import { harnessClaims } from "@/server/evaluation";

/**
 * The 154 dev claims with the evidence the 2024 classifier saw (the team's saved
 * retrieval lists) and the gold evidence, for the browser-side LLM harness.
 * Prerendered at build time: a static JSON file, no database access at runtime.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    description:
      "COMP90042 2024 dev claims: gold labels, the retrained classifier's stored verdicts, the saved 2024 retrieved passages and the gold passages.",
    claims: harnessClaims(),
  });
}
