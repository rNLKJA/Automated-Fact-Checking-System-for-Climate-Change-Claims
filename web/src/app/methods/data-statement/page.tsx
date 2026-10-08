import type { Metadata } from "next";

import { DocPage } from "@/components/common/doc-page";
import { getDoc } from "@/server/docs";

export const metadata: Metadata = {
  title: "Data statement",
  description:
    "Where the COMP90042 claims and Wikipedia evidence come from, label imbalance, the no-pretraining rule and what the site redistributes.",
};

export default function DataStatementPage() {
  const doc = getDoc("data-statement");
  return <DocPage eyebrow="Methods · data statement" doc={doc} source="docs/data-statement.md" />;
}
