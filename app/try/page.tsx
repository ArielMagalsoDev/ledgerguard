import type { Metadata } from "next";
import Link from "next/link";
import { UploadFlow } from "@/app/try/upload-flow";

export const metadata: Metadata = {
  title: "Try your own invoice — Ledger Guard",
  description: "Upload one invoice PDF and see Ledger Guard's real extraction, evidence alignment, and controls run on it — a temporary, sandboxed demonstration.",
};

// Bring-your-own-invoice sandbox (ledgerguard.md). Feature-flagged off by
// default — the seeded five-scenario /demo is the primary guided
// experience; this page proves the same real pipeline generalizes beyond
// fixtures, when explicitly enabled. Forced dynamic so flipping
// UPLOAD_SANDBOX_ENABLED takes effect on the next request rather than
// needing a full rebuild — this page has no DB read to force that itself,
// unlike /demo.
export const dynamic = "force-dynamic";

export default function TryPage() {
  const enabled = process.env.UPLOAD_SANDBOX_ENABLED === "true";

  if (!enabled) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center sm:px-8">
        <p className="section-marker">(Upload sandbox)</p>
        <h1 className="mt-3 font-display text-3xl font-normal text-ink">Not available right now</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          The bring-your-own-invoice sandbox is off by default and only turned on for limited windows. The five
          seeded scenarios in the guided demo run the exact same real extraction, evidence-alignment, and control
          pipeline — start there instead.
        </p>
        <Link href="/demo" className="btn-pill btn-pill-primary mt-6 inline-flex">
          Open the guided demo
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-8 sm:px-8">
      <div className="mb-6">
        <p className="section-marker">(Upload sandbox)</p>
        <h1 className="mt-2 font-display text-2xl font-normal text-ink sm:text-3xl">Try your own invoice</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Upload one invoice PDF and watch Ledger Guard&rsquo;s real pipeline run on it — the same extraction,
          evidence alignment, arithmetic checks, and control logic as the guided demo, on a document nobody prepared
          in advance.
        </p>
      </div>
      <UploadFlow />
    </div>
  );
}
