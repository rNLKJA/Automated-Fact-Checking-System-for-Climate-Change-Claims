import type { Metadata } from "next";
import Link from "next/link";

import { AuditLogView } from "@/components/ai-log/audit-log-view";
import { PageHeader } from "@/components/common/section";

export const metadata: Metadata = {
  title: "AI audit log",
  description:
    "Every LLM call made from this browser: what was sent, what came back, latency, tokens and your review decision. Stored only in your browser, exportable as JSON or CSV.",
  robots: { index: false },
};

export default function AiLogPage() {
  return (
    <>
      <PageHeader eyebrow="Transparency" title="AI audit log">
        One record per model call made from this browser: the prompt that was sent, the answer that
        came back, how long it took, the tokens the provider reported and your review (accepted,
        edited or rejected). It lives only in this browser&rsquo;s storage (IndexedDB). It is never
        sent to this site, and it never contains your API key.
      </PageHeader>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        <AuditLogView />
        <p className="max-w-3xl text-sm text-muted-foreground">
          What the AI features do and do not do, what is sent to the provider, and how review works
          is set out in the{" "}
          <Link href="/methods#ai-use" className="text-foreground underline underline-offset-4">
            AI use statement
          </Link>
          .
        </p>
      </div>
    </>
  );
}
