import type { Metadata } from "next";

import { PageHeader } from "@/components/common/section";
import { TryIt } from "@/components/try/try-it";
import { getOverview, protocolAccuracies } from "@/server/stats";

export const metadata: Metadata = {
  title: "Try a claim",
  description:
    "Type a climate claim and run the 2024 pipeline: TF-IDF evidence retrieval over a pruned Wikipedia index, then the from-scratch Transformer.",
};

export default async function TryPage({ searchParams }: PageProps<"/try">) {
  const { claim } = await searchParams;
  const initialClaim = typeof claim === "string" ? claim.slice(0, 600) : undefined;
  const o = getOverview();
  const acc = protocolAccuracies();
  return (
    <>
      <PageHeader eyebrow="Try it" title="Put a claim through the 2024 pipeline">
        Retrieval and classification run on the server with the TypeScript ports of the original
        code. They return the same passages and logits as the Python for every dev claim. The only
        difference is the corpus: a pruned index of {o.index.passages.toLocaleString("en-AU")}{" "}
        passages instead of all 1.2 million.
      </PageHeader>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <TryIt
          key={initialClaim ?? ""}
          initialClaim={initialClaim}
          devAccuracy={acc.single}
          baseline={o.classifier.majority_baseline_acc}
          indexSize={o.index.passages}
        />
      </div>
    </>
  );
}
