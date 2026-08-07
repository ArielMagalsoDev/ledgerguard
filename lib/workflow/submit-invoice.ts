import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { InvoiceSubmission } from "@/lib/types";

export const invoiceSubmissionSchema = z.object({
  submissionId: z.string().min(1),
  source: z.enum(["email", "upload", "shared_folder", "demo_scenario"]),
  originalFileName: z.string().min(1),
  fileHash: z.string().min(1),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  receivedAt: z.string().min(1),
  senderEmail: z.string().email().optional(),
}) satisfies z.ZodType<InvoiceSubmission>;

export type SubmitInvoiceResult = {
  invoiceId: string;
  workflowId: string;
  status: string;
  isReplay: boolean;
};

const UNIQUE_VIOLATION = "23505";

/**
 * Idempotent workflow intake. `submissionId` is the idempotency key: a
 * replayed submission returns the existing workflow's result and never
 * creates a second row or a second job — the unique constraint on
 * invoices.submission_id is the actual enforcement point, not this
 * function's control flow, so this is race-safe under concurrent calls.
 */
export async function submitInvoice(
  submission: InvoiceSubmission
): Promise<SubmitInvoiceResult> {
  const db = supabaseAdmin();

  const { data: inserted, error: insertError } = await db
    .from("invoices")
    .insert({
      submission_id: submission.submissionId,
      source: submission.source,
      original_file_name: submission.originalFileName,
      file_hash: submission.fileHash,
      mime_type: submission.mimeType,
      received_at: submission.receivedAt,
      sender_email: submission.senderEmail ?? null,
      status: "pending",
    })
    .select("id, workflow_id, status")
    .single();

  if (insertError) {
    if (insertError.code !== UNIQUE_VIOLATION) {
      throw new Error(`submitInvoice: insert failed — ${insertError.message}`);
    }

    // Replay: the row already exists. Fetch it and log the attempt, but
    // never create a second job for it.
    const { data: existing, error: fetchError } = await db
      .from("invoices")
      .select("id, workflow_id, status")
      .eq("submission_id", submission.submissionId)
      .single();

    if (fetchError || !existing) {
      throw new Error(
        `submitInvoice: replay detected but could not load the existing row — ${fetchError?.message}`
      );
    }

    await db.from("audit_events").insert({
      workflow_id: existing.workflow_id,
      invoice_id: existing.id,
      event_id: `${existing.id}:replay:${Date.now()}`,
      stage: "replay_detected",
      label: "Replayed submission",
      detail: `submissionId ${submission.submissionId} was already processed — returned the existing workflow result without creating a new job.`,
      actor: "system",
    });

    return {
      invoiceId: existing.id,
      workflowId: existing.workflow_id,
      status: existing.status,
      isReplay: true,
    };
  }

  // New submission: create the durable job and the intake audit event.
  // If either write fails here, the invoice row still exists and is safe
  // to retry — a stuck job can always be recreated for a known invoiceId.
  await db.from("jobs").insert({
    invoice_id: inserted.id,
    job_type: "process_invoice",
    payload: { invoiceId: inserted.id, submissionId: submission.submissionId },
    status: "queued",
  });

  await db.from("audit_events").insert({
    workflow_id: inserted.workflow_id,
    invoice_id: inserted.id,
    event_id: `${inserted.id}:submission_received`,
    stage: "submission_received",
    label: "Submission received",
    detail: `${submission.source} intake, submissionId ${submission.submissionId}.`,
    actor: "system",
  });

  return {
    invoiceId: inserted.id,
    workflowId: inserted.workflow_id,
    status: inserted.status,
    isReplay: false,
  };
}
