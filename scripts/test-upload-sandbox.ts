// Ad-hoc end-to-end verification for the upload sandbox (Phases 1-3). Not a
// permanent part of the test suite — exercises the real pipeline directly
// (no HTTP layer) against a genuinely arbitrary invoice (unknown supplier,
// not derived from any seeded fixture) to confirm the upload-mode policy
// behaves as ledgerguard.md specifies: exception_review, never blocked or
// ready_for_approval, real evidence-aligned extraction throughout.
import { randomUUID } from "node:crypto";
import { generateInvoicePdf } from "@/lib/extraction/pdf-generate";
import { validateUpload } from "@/lib/upload/validate-upload";
import { processUpload } from "@/lib/upload/process-upload";
import { getUploadScenario } from "@/lib/upload/upload-scenario";
import { purgeUploadInvoice } from "@/lib/upload/session";
import { supabaseAdmin } from "@/lib/supabase/server";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("=== Upload sandbox verification ===\n");

  // --- 1. Validation rejects a non-PDF ---
  console.log("1. File validation");
  const notAPdf = new TextEncoder().encode("not a pdf at all");
  const nonPdfResult = await validateUpload(notAPdf);
  check("rejects non-PDF bytes", !nonPdfResult.ok && nonPdfResult.error === "not_a_pdf");

  const oversized = new Uint8Array(6 * 1024 * 1024);
  const oversizedResult = await validateUpload(oversized);
  check("rejects oversized file", !oversizedResult.ok && oversizedResult.error === "file_too_large");

  // --- 2. Generate a genuinely arbitrary invoice (unknown supplier) ---
  console.log("\n2. Generating an arbitrary (non-seeded) invoice PDF");
  const invoiceNumber = `EXT-${Date.now()}`;
  const pdfBytes = await generateInvoicePdf([
    { id: "h1", kind: "header", text: "Riverside Print & Signage Co." },
    { id: "h2", kind: "meta", text: `Invoice #: ${invoiceNumber}` },
    { id: "h3", kind: "meta", text: "Invoice Date: 2026-08-01" },
    { id: "h4", kind: "meta", text: "Due Date: 2026-08-31" },
    { id: "h5", kind: "meta", text: "Tax ID: 99-9999999" },
    { id: "t1", kind: "table-header", text: "Description | Qty | Unit Price | Line Total" },
    { id: "l1", kind: "line-item", text: "Vinyl banner printing, 4x8ft | 3 | $85.00 | $255.00" },
    { id: "l2", kind: "line-item", text: "Installation labor | 2 | $60.00 | $120.00" },
    { id: "s1", kind: "totals", text: "Subtotal: $375.00" },
    { id: "s2", kind: "totals", text: "Sales Tax (8%): $30.00" },
    { id: "s3", kind: "totals", text: "Total: $405.00" },
    { id: "f1", kind: "footer", text: "Thank you for your business." },
  ]);
  const validation = await validateUpload(pdfBytes);
  check("real text-layer PDF passes validation", validation.ok, !validation.ok ? validation.message : undefined);

  // --- 3. Run it through the real pipeline under a fresh session ---
  console.log("\n3. Running through processUpload (real Claude extraction + upload-mode decision)");
  const sessionToken = randomUUID();
  const result = await processUpload(pdfBytes, "riverside-invoice.pdf", sessionToken);
  check("processUpload completed", result.ok, !result.ok ? JSON.stringify(result) : undefined);

  if (result.ok) {
    console.log(`  → outcome: ${result.outcome}`);
    check(
      "unknown-supplier upload is exception_review, not blocked",
      result.outcome === "exception_review",
      `got ${result.outcome}`
    );

    // --- 4. Assemble the scenario the /try result page would render ---
    console.log("\n4. Assembling upload scenario (what the result UI renders)");
    const scenario = await getUploadScenario(result.invoiceId, sessionToken);
    check("scenario state is ready", scenario.state === "ready", `got ${scenario.state}`);

    if (scenario.state === "ready") {
      check("supplier shows as unmatched (honest, not fabricated)", scenario.scenario.match.supplierMatch === "none");
      check("no accounting draft was proposed", scenario.scenario.decision.proposedAccountingChange === undefined);
      check("extracted total came through", scenario.scenario.extracted.total.value === "405.00");
      check("policy version records upload-sandbox variant", scenario.scenario.decision.policyVersion.includes("upload-sandbox"));
      check("expires_at is set (~30 min out)", !!scenario.expiresAt);

      // Cross-session isolation: a different session token must not see this invoice.
      const otherSession = await getUploadScenario(result.invoiceId, randomUUID());
      check("a different session cannot fetch this invoice", otherSession.state === "not_found");
    }

    // --- 5. Replay: same bytes, same session — must not re-run extraction ---
    console.log("\n5. Replay idempotency");
    const db = supabaseAdmin();
    const { count: jobCountBefore } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("invoice_id", result.invoiceId);
    const replay = await processUpload(pdfBytes, "riverside-invoice.pdf", sessionToken);
    check("replay returns the same invoice", replay.ok && replay.invoiceId === result.invoiceId);
    const { count: jobCountAfter } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("invoice_id", result.invoiceId);
    check("replay created no second job", jobCountBefore === jobCountAfter, `before=${jobCountBefore} after=${jobCountAfter}`);

    // --- 6. Cleanup ---
    console.log("\n6. Deletion");
    const { data: invoiceRow } = await db.from("invoices").select("storage_path").eq("id", result.invoiceId).maybeSingle();
    await purgeUploadInvoice(db, result.invoiceId, invoiceRow?.storage_path ?? null);
    const { data: afterDelete } = await db.from("invoices").select("id").eq("id", result.invoiceId).maybeSingle();
    check("invoice row deleted", !afterDelete);
    const { data: controlsAfter } = await db.from("controls").select("id").eq("invoice_id", result.invoiceId);
    check("controls cascade-deleted", (controlsAfter ?? []).length === 0);
    const { data: deletionLog } = await db.from("upload_deletions").select("*").eq("invoice_id", result.invoiceId).order("deleted_at", { ascending: false }).limit(1);
    check("deletion logged to upload_deletions", (deletionLog ?? []).length > 0);
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
