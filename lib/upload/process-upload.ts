// Upload sandbox — the actual intake + processing sequence a POST
// /api/upload request runs. Kept separate from the route handler so the
// route stays thin (multipart parsing, cookies, rate limiting) and this
// stays independently reasoned-about: validate → hash → store → idempotent
// intake → drain the job queue until *this* invoice's decision exists.
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { submitInvoice } from "@/lib/workflow/submit-invoice";
import { processNextInvoiceJob } from "@/lib/workflow/process-invoice-job";
import { validateUpload, type UploadValidationError } from "@/lib/upload/validate-upload";
import { newExpiryTimestamp, sweepExpiredUploads } from "@/lib/upload/session";
import type { DecisionOutcome } from "@/lib/types";

const STORAGE_BUCKET = "invoice-documents";
// Bounded drain: each iteration processes at most one queued job (one
// extraction call, ~6-9s observed in the eval suite). 20 iterations covers
// "someone else's jobs happened to be queued ahead of ours" without risking
// the route hanging indefinitely if something is genuinely stuck — at that
// point processNextInvoiceJob() returns {processed:false} (empty queue) and
// the loop exits early anyway.
const MAX_DRAIN_ITERATIONS = 20;

export type UploadProcessResult =
  | { ok: true; invoiceId: string; outcome: DecisionOutcome }
  | { ok: false; reason: "validation"; error: UploadValidationError; message: string }
  | { ok: false; reason: "processing_incomplete"; invoiceId: string }
  | { ok: false; reason: "processing_failed"; invoiceId: string; message: string };

/**
 * Runs one upload through the full existing pipeline (validate → store →
 * idempotent intake → extraction/matching/decision) under the upload-mode
 * policy. `sessionToken` scopes storage path, duplicate detection, and the
 * `expires_at` deletion deadline set on the invoice row.
 */
export async function processUpload(
  bytes: Uint8Array,
  originalFileName: string,
  sessionToken: string
): Promise<UploadProcessResult> {
  const validation = await validateUpload(bytes);
  if (!validation.ok) {
    return { ok: false, reason: "validation", error: validation.error, message: validation.message };
  }

  const db = supabaseAdmin();
  await sweepExpiredUploads(db); // opportunistic — see session.ts

  const digest = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `uploads/${sessionToken}/${digest}.pdf`;

  const submission = await submitInvoice({
    submissionId: `upload:${sessionToken}:${digest}`,
    source: "upload",
    originalFileName,
    fileHash: digest,
    mimeType: "application/pdf",
    receivedAt: new Date().toISOString(),
  });

  // Replay of the same file within the same session (or a retried request):
  // the pipeline already ran or is running under this exact submissionId —
  // never re-upload the object or re-trigger extraction, same idempotency
  // guarantee submitInvoice already gives every other intake path.
  if (!submission.isReplay) {
    const { error: uploadError } = await db.storage.from(STORAGE_BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      throw new Error(`processUpload: storage upload failed — ${uploadError.message}`);
    }

    await db
      .from("invoices")
      .update({ storage_path: storagePath, session_token: sessionToken, expires_at: newExpiryTimestamp() })
      .eq("id", submission.invoiceId);
  }

  for (let i = 0; i < MAX_DRAIN_ITERATIONS; i++) {
    const { data: decision } = await db
      .from("decisions")
      .select("outcome")
      .eq("invoice_id", submission.invoiceId)
      .maybeSingle();
    if (decision) {
      return { ok: true, invoiceId: submission.invoiceId, outcome: decision.outcome as DecisionOutcome };
    }

    const jobResult = await processNextInvoiceJob();
    if (!jobResult.processed) break; // queue empty — nothing left to drain

    if (
      "error" in jobResult &&
      jobResult.invoiceId === submission.invoiceId
    ) {
      return { ok: false, reason: "processing_failed", invoiceId: submission.invoiceId, message: jobResult.error };
    }
  }

  // One last check in case the final drain iteration wrote the decision
  // but this loop's early-exit raced past reading it.
  const { data: finalDecision } = await db
    .from("decisions")
    .select("outcome")
    .eq("invoice_id", submission.invoiceId)
    .maybeSingle();
  if (finalDecision) {
    return { ok: true, invoiceId: submission.invoiceId, outcome: finalDecision.outcome as DecisionOutcome };
  }

  return { ok: false, reason: "processing_incomplete", invoiceId: submission.invoiceId };
}
