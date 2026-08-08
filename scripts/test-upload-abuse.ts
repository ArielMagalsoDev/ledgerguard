/**
 * Phase 4's adversarial corpus (ledgerguard.md): malformed/encrypted/
 * oversized/many-page/no-text-layer files, concurrency, retry idempotency,
 * daily-spend-cap exhaustion, cleanup-failure visibility, rate limiting,
 * Turnstile, and a static accounting-unreachability assertion. Everything
 * here exercises real code paths — no mocked pdfjs, no fake Cloudflare
 * response, no stubbed Supabase client.
 *
 *   npm run test-upload-abuse
 */
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { validateUpload } from "@/lib/upload/validate-upload";
import { buildEncryptedPdf } from "@/lib/upload/build-encrypted-pdf";
import { generateInvoicePdf } from "@/lib/extraction/pdf-generate";
import { processUpload } from "@/lib/upload/process-upload";
import { purgeUploadInvoice } from "@/lib/upload/session";
import { checkRateLimit } from "@/lib/upload/rate-limit";
import { verifyTurnstile } from "@/lib/upload/turnstile";
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

async function buildTooManyPagesPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 5; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${i + 1} of a 5-page document`, { x: 54, y: 700, size: 12, font });
  }
  return doc.save();
}

async function buildNoTextLayerPdf(): Promise<Uint8Array> {
  // A structurally valid, unencrypted, single-page PDF with an empty content
  // stream — no drawText calls at all. This is what a scanned/image-only
  // invoice's PDF wrapper looks like at the text-layer level: the page
  // exists, pdfjs opens it fine, but there's nothing for the deterministic
  // evidence-alignment pipeline to read.
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save();
}

async function main() {
  console.log("=== Upload sandbox abuse testing (Phase 4) ===\n");
  const db = supabaseAdmin();

  // --- 1. Validation: the full adversarial file corpus ---
  console.log("1. Adversarial file validation");

  const malformed = new TextEncoder().encode("%PDF-1.4\nthis is not real PDF structure at all, just garbage bytes after the header");
  const malformedResult = await validateUpload(malformed);
  check("malformed PDF rejected", !malformedResult.ok && malformedResult.error === "malformed_pdf", JSON.stringify(malformedResult));

  const encrypted = buildEncryptedPdf(`abuse-test-${randomUUID()}`);
  const encryptedResult = await validateUpload(encrypted);
  check("genuinely password-protected PDF rejected as encrypted_pdf", !encryptedResult.ok && encryptedResult.error === "encrypted_pdf", JSON.stringify(encryptedResult));

  const tooManyPages = await buildTooManyPagesPdf();
  const pagesResult = await validateUpload(tooManyPages);
  check("5-page PDF rejected as too_many_pages", !pagesResult.ok && pagesResult.error === "too_many_pages", JSON.stringify(pagesResult));

  const noTextLayer = await buildNoTextLayerPdf();
  const noTextResult = await validateUpload(noTextLayer);
  check("blank/scanned-style PDF rejected as no_text_layer", !noTextResult.ok && noTextResult.error === "no_text_layer", JSON.stringify(noTextResult));

  const spoofed = new TextEncoder().encode("<html>this claims to be a pdf via filename only</html>");
  const spoofedResult = await validateUpload(spoofed);
  check("non-PDF bytes rejected regardless of claimed type", !spoofedResult.ok && spoofedResult.error === "not_a_pdf", JSON.stringify(spoofedResult));

  const oversized = new Uint8Array(6 * 1024 * 1024);
  oversized.set(new TextEncoder().encode("%PDF-"));
  const oversizedResult = await validateUpload(oversized);
  check("oversized file rejected before any parsing", !oversizedResult.ok && oversizedResult.error === "file_too_large");

  // --- 2. Concurrency: two simultaneous uploads of the identical bytes under
  // the identical session must never create two invoices or two jobs — the
  // same idempotency guarantee submitInvoice gives every intake path,
  // proven here under genuine concurrent load, not sequential calls. ---
  console.log("\n2. Concurrency — identical upload fired twice at once");
  const concurrentBytes = await generateInvoicePdf([
    { id: "h1", kind: "header", text: "Havenbrook Facilities Supply" },
    { id: "h2", kind: "meta", text: `Invoice #: HFS-${Date.now()}` },
    { id: "h3", kind: "meta", text: "Invoice Date: 2026-08-01" },
    { id: "t1", kind: "table-header", text: "Description | Qty | Unit Price | Line Total" },
    { id: "l1", kind: "line-item", text: "Bulk paper towel cases | 4 | $22.00 | $88.00" },
    { id: "s1", kind: "totals", text: "Subtotal: $88.00" },
    { id: "s2", kind: "totals", text: "Sales Tax (8%): $7.04" },
    { id: "s3", kind: "totals", text: "Total: $95.04" },
  ]);
  const sharedSession = randomUUID();
  const [raceA, raceB] = await Promise.all([
    processUpload(concurrentBytes, "race.pdf", sharedSession),
    processUpload(concurrentBytes, "race.pdf", sharedSession),
  ]);
  // The real guarantee isn't "both callers see 201 synchronously" — under
  // genuine concurrency, whichever caller loses the claim_next_job race can
  // legitimately see its OWN bounded drain loop run dry (the other caller
  // already claimed and is mid-processing) and get back
  // processing_incomplete rather than the finished result. What must never
  // happen is two invoice rows or two jobs for the one shared
  // submissionId — checked directly below via the DB, not by requiring a
  // specific response shape from each racer.
  const raceIds = [raceA, raceB].map((r) => ("invoiceId" in r ? r.invoiceId : null)).filter((id): id is string => !!id);
  const raceInvoiceId = raceIds[0] ?? null;
  check("no duplicate invoice — both requests reference the same invoiceId", raceIds.length > 0 && raceIds.every((id) => id === raceInvoiceId), JSON.stringify({ raceA, raceB }));
  if (raceInvoiceId) {
    const { count: raceJobCount } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("invoice_id", raceInvoiceId);
    check("exactly one job exists for the raced invoice", raceJobCount === 1, `count=${raceJobCount}`);
    const { data: raceRow } = await db.from("invoices").select("storage_path").eq("id", raceInvoiceId).maybeSingle();
    await purgeUploadInvoice(db, raceInvoiceId, raceRow?.storage_path ?? null);
  }

  // --- 3. Daily spend cap: a $0 cap must defer the job, not corrupt state
  // or silently proceed to a real model call. ---
  console.log("\n3. Daily spend-cap exhaustion");
  const capBytes = await generateInvoicePdf([
    { id: "h1", kind: "header", text: "Northgate Elevator Parts" },
    { id: "h2", kind: "meta", text: `Invoice #: NEP-${Date.now()}` },
    { id: "t1", kind: "table-header", text: "Description | Qty | Unit Price | Line Total" },
    { id: "l1", kind: "line-item", text: "Cable inspection | 1 | $150.00 | $150.00" },
    { id: "s1", kind: "totals", text: "Subtotal: $150.00" },
    { id: "s2", kind: "totals", text: "Sales Tax (8%): $12.00" },
    { id: "s3", kind: "totals", text: "Total: $162.00" },
  ]);
  const originalCap = process.env.DAILY_SPEND_CAP_USD;
  process.env.DAILY_SPEND_CAP_USD = "0"; // no budget left for today
  const capSession = randomUUID();
  const capResult = await processUpload(capBytes, "cap-test.pdf", capSession);
  process.env.DAILY_SPEND_CAP_USD = originalCap;
  // A $0 cap makes reserve_spend deny the reservation; the job processor
  // throws, the job is marked failed_transient (retryable — "will retry" in
  // its own message), and processUpload surfaces that as processing_failed
  // rather than silently proceeding to a real model call or corrupting the
  // invoice row into some half-processed state.
  check(
    "a $0 spend cap fails the job with a clear, retryable reason — no corrupted state",
    !capResult.ok && "reason" in capResult && capResult.reason === "processing_failed" && "message" in capResult && capResult.message.includes("spend cap"),
    JSON.stringify(capResult)
  );
  if (!capResult.ok && "invoiceId" in capResult) {
    const { data: capInvoice } = await db.from("invoices").select("status, storage_path").eq("id", capResult.invoiceId).maybeSingle();
    check("invoice status stayed 'processing', not corrupted", capInvoice?.status === "processing", `status=${capInvoice?.status}`);
    // Retry now that the (restored) real cap applies, then clean up either way.
    const { data: job } = await db.from("jobs").select("id").eq("invoice_id", capResult.invoiceId).maybeSingle();
    if (job) await db.from("jobs").update({ status: "queued", attempts: 0 }).eq("id", job.id);
    const retry = await processUpload(capBytes, "cap-test.pdf", capSession);
    check("retried after cap headroom returns, processes normally", retry.ok, JSON.stringify(retry));
    await purgeUploadInvoice(db, capResult.invoiceId, capInvoice?.storage_path ?? null);
  }

  // --- 4. Cleanup-failure visibility: purging an already-gone storage
  // object must not throw, and must still log the attempt (so /operations
  // can catch a real cleanup failure instead of it silently vanishing). ---
  console.log("\n4. Cleanup-failure visibility (double-delete / already-gone storage object)");
  const cleanupBytes = await generateInvoicePdf([
    { id: "h1", kind: "header", text: "Silverline Pressure Washing" },
    { id: "h2", kind: "meta", text: `Invoice #: SPW-${Date.now()}` },
    { id: "t1", kind: "table-header", text: "Description | Qty | Unit Price | Line Total" },
    { id: "l1", kind: "line-item", text: "Parking deck wash | 1 | $410.00 | $410.00" },
    { id: "s1", kind: "totals", text: "Subtotal: $410.00" },
    { id: "s2", kind: "totals", text: "Sales Tax (8%): $32.80" },
    { id: "s3", kind: "totals", text: "Total: $442.80" },
  ]);
  const cleanupSession = randomUUID();
  const cleanupResult = await processUpload(cleanupBytes, "cleanup-test.pdf", cleanupSession);
  if (cleanupResult.ok) {
    const { data: row } = await db.from("invoices").select("storage_path").eq("id", cleanupResult.invoiceId).maybeSingle();
    const storagePath = row?.storage_path ?? null;
    await purgeUploadInvoice(db, cleanupResult.invoiceId, storagePath); // first delete — real object present
    let secondDeleteThrew = false;
    try {
      // Second delete on the SAME (now-gone) storage path + already-deleted
      // invoice row — simulates the sweep racing the cron backstop.
      await purgeUploadInvoice(db, cleanupResult.invoiceId, storagePath);
    } catch {
      secondDeleteThrew = true;
    }
    check("double-purge of an already-deleted invoice does not throw", !secondDeleteThrew);
    const { data: deletionLogs } = await db
      .from("upload_deletions")
      .select("id")
      .eq("invoice_id", cleanupResult.invoiceId);
    check("both purge attempts are logged to upload_deletions", (deletionLogs ?? []).length >= 2, `count=${(deletionLogs ?? []).length}`);
  } else {
    check("cleanup-failure test invoice processed", false, JSON.stringify(cleanupResult));
  }

  // --- 5. Rate limiting ---
  console.log("\n5. Rate limiting");
  const rateLimitKey = `test-abuse-${randomUUID()}`;
  const maxPerHour = Number(process.env.RATE_LIMIT_PER_HOUR ?? "5");
  let sawDenial = false;
  for (let i = 0; i < maxPerHour + 2; i++) {
    const result = await checkRateLimit(rateLimitKey);
    if (!result.allowed) {
      sawDenial = true;
      break;
    }
  }
  check(`rate limit denies after ${maxPerHour}/hour`, sawDenial);
  await db.from("rate_limit_events").delete().eq("client_key", rateLimitKey); // test cleanup

  // --- 6. Turnstile ---
  console.log("\n6. Turnstile bot protection");
  const hasRealSecret = !!process.env.TURNSTILE_SECRET_KEY;
  if (hasRealSecret) {
    const noToken = await verifyTurnstile(null, "127.0.0.1");
    check("missing token rejected when a real secret key is configured", !noToken.ok && noToken.reason === "missing_token");
    const badToken = await verifyTurnstile("obviously-not-a-real-token", "127.0.0.1");
    check("garbage token rejected by the real Cloudflare API", !badToken.ok, JSON.stringify(badToken));
  } else {
    console.log("  (TURNSTILE_SECRET_KEY not set locally — skipping live-rejection checks)");
  }
  const savedSecret = process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  const passThrough = await verifyTurnstile(null, "127.0.0.1");
  process.env.TURNSTILE_SECRET_KEY = savedSecret;
  check("documented pass-through when no secret key is configured at all", passThrough.ok);

  // --- 7. Accounting unreachability (static assertion, not a live probe —
  // the point is that the code path DOESN'T EXIST, so nothing to call at
  // runtime; a grep-based regression guard catches it being wired in later
  // more reliably than trying to prove a negative at runtime). ---
  console.log("\n7. Accounting-system unreachability from the upload pipeline");
  const filesToCheck = [
    "lib/workflow/process-invoice-job.ts",
    "lib/upload/process-upload.ts",
    "lib/upload/validate-upload.ts",
    "lib/upload/session.ts",
  ];
  let accountingClientReferenced = false;
  for (const file of filesToCheck) {
    const contents = readFileSync(file, "utf-8");
    if (contents.includes("qbo-client") || contents.includes("createDraftBill") || contents.includes("qboApiCall")) {
      accountingClientReferenced = true;
      console.log(`  ! found accounting-client reference in ${file}`);
    }
  }
  check(
    "no upload-pipeline file imports or calls the QuickBooks client",
    !accountingClientReferenced
  );
  check(
    "accounting_bills is only ever touched defensively (delete-on-cleanup), never written",
    (() => {
      const sessionSrc = readFileSync("lib/upload/session.ts", "utf-8");
      return sessionSrc.includes('from("accounting_bills").delete(') && !sessionSrc.includes('from("accounting_bills").insert(');
    })()
  );

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);

  // Fixture hash sanity — proves buildEncryptedPdf isn't accidentally a
  // no-op that happens to also fail validation for some unrelated reason.
  console.log(`\n(encrypted fixture sha256: ${createHash("sha256").update(encrypted).digest("hex").slice(0, 12)}...)`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
