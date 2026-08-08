import type { Metadata } from "next";
import Link from "next/link";
import { UploadFlow } from "@/app/try/upload-flow";
import { PageHero } from "@/components/page-hero";
import { RecruiterProof } from "@/components/recruiter-proof";

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
      <div>
        <PageHero
          eyebrow="Controlled upload boundary"
          title={<>The public upload sandbox is <span className="text-accent">closed by default.</span></>}
          description={<>Arbitrary document intake creates file-safety, privacy, abuse, and model-spend risk. Limited upload windows use the same extraction and control pipeline while applying a stricter policy that never allows a user document to become ready for approval.</>}
          actions={<Link href="/demo" className="btn-pill btn-pill-primary">Open the guided demo</Link>}
          aside={<span className="font-tabular text-xs text-ink-faint">UPLOAD_SANDBOX_ENABLED=false</span>}
        />
        <RecruiterProof
          title="A closed feature can still demonstrate good product judgment."
          description="The upload path is implemented and evaluated separately, but disabled unless the file-safety, privacy, rate-limit, deletion, and spend controls are intentionally enabled."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHero
        eyebrow="Temporary upload sandbox"
        title={<>Run an unseen invoice through the <span className="text-accent">controlled pipeline.</span></>}
        description={<>Upload one invoice PDF and inspect extraction, evidence alignment, arithmetic, and control logic on a document not prepared as a guided scenario. Uploaded documents can never reach ready-for-approval.</>}
        actions={<Link href="/demo" className="btn-pill btn-pill-outline">Use the guided demo instead</Link>}
        aside={<span className="font-tabular text-xs text-ready">Sandbox open · temporary retention</span>}
      />
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8"><UploadFlow /></div>
      <RecruiterProof
        title="The upload path proves the policy boundary generalizes."
        description="It uses separate validation, rate limiting, temporary storage, stricter routing, deletion controls, and its own evaluation results."
      />
    </div>
  );
}
