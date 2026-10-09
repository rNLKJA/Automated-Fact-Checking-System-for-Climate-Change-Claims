import type { Metadata } from "next";

import { PageHeader } from "@/components/common/section";
import { TryIt } from "@/components/try/try-it";
import { getBaselineReport, getSingleVsMajority } from "@/server/evaluation";
import { freeTextParity, getOverview, tryExamples } from "@/server/stats";

export const metadata: Metadata = {
  title: "Try a claim",
  description:
    "Type a climate claim and run the 2024 pipeline: TF-IDF evidence retrieval over a pruned Wikipedia index, then the from-scratch Transformer.",
};

export default async function TryPage({ searchParams }: PageProps<"/try">) {
  const { claim } = await searchParams;
  const initialClaim = typeof claim === "string" ? claim.slice(0, 600) : undefined;
  const o = getOverview();
  const b = getBaselineReport();
  const gap = getSingleVsMajority().difference;
  const parity = freeTextParity();
  const agreement = {
    submission: {
      claims: parity.claims,
      agree: parity.submission.agree,
      byPath: parity.submission.by_path,
    },
    notebook: {
      claims: parity.claims,
      agree: parity.notebook.agree,
      byPath: parity.notebook.by_path,
    },
  };
  return (
    <>
      <PageHeader eyebrow="Try it" title="Put a claim through the 2024 pipeline">
        Retrieval and classification run on the server with the TypeScript ports of the original
        code. The difference is the corpus: a pruned index of{" "}
        {o.index.passages.toLocaleString("en-AU")} passages instead of all 1.19 million. For the
        dataset&rsquo;s claims and the examples below it returns the same passages as the full 2024
        search. For other sentences it agreed on {parity.submission.agree} of {parity.claims}{" "}
        hand-written test claims, and every result says which case applies.
      </PageHeader>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <TryIt
          key={initialClaim ?? ""}
          initialClaim={initialClaim}
          examples={tryExamples().map(({ text, note }) => ({ text, note }))}
          agreement={agreement}
          devAccuracy={b.protocols.single.accuracy}
          baseline={b.majority.accuracy.estimate}
          gap={{ estimate: gap.estimate, lower: gap.lower, upper: gap.upper }}
          indexSize={o.index.passages}
        />
      </div>
    </>
  );
}
