import type { Metadata } from "next";

import { DocPage } from "@/components/common/doc-page";
import { getDoc } from "@/server/docs";

export const metadata: Metadata = {
  title: "Model card",
  description:
    "Intended use, training data, evaluation with 95% intervals, known failure modes and ethical considerations for the retrained 2024 fact-checking pipeline.",
};

export default function ModelCardPage() {
  const doc = getDoc("model-card");
  return <DocPage eyebrow="Methods · model card" doc={doc} source="docs/model-card.md" />;
}
