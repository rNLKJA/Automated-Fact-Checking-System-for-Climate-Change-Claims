import Link from "next/link";

import { Stripes } from "@/components/common/stripes";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-6 px-4 py-24 sm:px-6">
      <Stripes className="h-1.5 w-40 rounded-full" count={16} />
      <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
        404 · not enough info
      </p>
      <h1 className="text-headline font-medium">
        We couldn&rsquo;t retrieve any evidence for this page.
      </h1>
      <p className="text-lg text-muted-foreground">
        The address may be mistyped, or the claim id may not be one of the 154 dev claims.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/">Back to the start</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/explore">Browse dev claims</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/try">Try a claim</Link>
        </Button>
      </div>
    </div>
  );
}
