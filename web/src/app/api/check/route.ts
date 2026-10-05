import { NextResponse } from "next/server";

import { CheckRequest } from "@/lib/check-schema";
import { EmptyClaimError } from "@/lib/retrieval";
import { checkClaim } from "@/server/pipeline";

/** Run the 2024 pipeline (retrieval over the pruned index + Transformer) on one claim. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body like {"claim": "..."}.' }, { status: 400 });
  }
  const parsed = CheckRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  try {
    const result = checkClaim(parsed.data.claim, parsed.data.rule);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof EmptyClaimError) {
      return NextResponse.json(
        {
          error:
            "Every word in that claim is a stopword or punctuation, so the 2024 pipeline has nothing to search with. Try adding some content words.",
        },
        { status: 422 },
      );
    }
    console.error("check failed", err);
    return NextResponse.json(
      { error: "Something went wrong while checking the claim." },
      { status: 500 },
    );
  }
}

export function GET() {
  return NextResponse.json(
    { usage: 'POST a JSON body {"claim": string, "rule"?: "submission" | "notebook"}.' },
    { status: 405, headers: { Allow: "POST" } },
  );
}
