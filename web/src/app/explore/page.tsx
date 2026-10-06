import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, Stat } from "@/components/common/section";
import { ClaimBrowser } from "@/components/explore/claim-browser";
import { fixed, pct } from "@/lib/format";
import { PROTOCOLS } from "@/lib/types";
import { listDevClaims } from "@/server/claims";
import { getOverview, protocolAccuracies } from "@/server/stats";

export const metadata: Metadata = {
  title: "Explore the dev set",
  description:
    "Browse the 154 dev claims: gold vs retrieved evidence, per-claim precision and recall, and the model's verdicts.",
};

export default function ExplorePage() {
  const claims = listDevClaims();
  const o = getOverview();
  const acc = protocolAccuracies();
  const hits = claims.filter((c) => c.nCorrect > 0).length;
  const fallback = claims.filter((c) => c.path === "fallback").length;

  return (
    <>
      <PageHeader
        eyebrow="Explore · dev set"
        title="154 claims, the evidence found for them, and the verdicts"
      >
        Each row shows the annotators&rsquo; label and the retrained Transformer&rsquo;s verdict. It
        also shows how many of the human-chosen gold passages the 2024 retrieval found. Open a claim
        to compare gold and retrieved evidence side by side.
      </PageHeader>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Mean evidence F (2024 retrieval)"
            value={fixed(o.retrieval.dev_f_saved_2024, 3)}
            note="Exactly the value in the report."
          />
          <Stat
            label="Claims with any gold passage found"
            value={`${hits} / ${claims.length}`}
            note={`Mean precision ${fixed(o.retrieval.dev_precision_saved_2024, 3)}, recall ${fixed(o.retrieval.dev_recall_saved_2024, 3)}.`}
          />
          <Stat
            label="Verdict accuracy"
            value={pct(acc.batch)}
            note={`${PROTOCOLS.batch.title}. Always answering "supports" scores ${pct(o.classifier.majority_baseline_acc)}.`}
          />
          <Stat
            label="Claims on the fallback path"
            value={pct(fallback / claims.length, 0)}
            note="No passage passed the 0.55 / 0.5 thresholds in the re-run of the submission rule, so the top six by score were used instead."
          />
        </div>
        <ClaimBrowser claims={claims} />
        <p className="text-sm text-muted-foreground">
          Charts for the whole set (label balance, confusion matrix, threshold trade-offs and
          training curves) are on the{" "}
          <Link href="/results" className="text-foreground underline underline-offset-4">
            results page
          </Link>
          .
        </p>
      </div>
    </>
  );
}
