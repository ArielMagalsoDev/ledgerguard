import { supabaseAdmin } from "@/lib/supabase/server";
import { extractInvoice } from "@/lib/extraction/extract-invoice";
import { decideInvoice } from "@/lib/matching/decide";
import { parsePolicyConfig } from "@/lib/matching/policy";
import type { DecisionOutcome, ExtractedInvoice } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

const SPEND_ESTIMATE_USD = 0.02; // conservative ceiling for one extraction call, refunded down to actual cost
const ARITHMETIC_CONTROL_IDS = new Set(["arithmetic_line_totals", "arithmetic_subtotal", "arithmetic_tax_total"]);

export type ProcessJobResult =
  | { processed: false }
  | { processed: true; invoiceId: string; outcome: DecisionOutcome }
  | { processed: true; invoiceId: string; error: string };

async function writeAuditEvent(
  db: ReturnType<typeof supabaseAdmin>,
  workflowId: string,
  invoiceId: string,
  stage: string,
  label: string,
  detail: string,
  actor: "system" | "ai_model" | "human",
  latencyMs?: number,
  costUsd?: number
) {
  await db.from("audit_events").insert({
    workflow_id: workflowId,
    invoice_id: invoiceId,
    event_id: `${invoiceId}:${stage}:${Date.now()}`,
    stage,
    label,
    detail,
    actor,
    latency_ms: latencyMs,
    cost_usd: costUsd,
  });
}

function countVerified(extracted: ExtractedInvoice): { verified: number; total: number } {
  const headerFields = [
    extracted.invoiceNumber,
    extracted.invoiceDate,
    extracted.dueDate,
    extracted.supplierName,
    extracted.supplierTaxId,
    extracted.purchaseOrderNumber,
    extracted.currency,
    extracted.subtotal,
    extracted.tax,
    extracted.total,
    extracted.remittanceDetails,
    extracted.notes,
  ].filter((f): f is NonNullable<typeof f> => f != null);

  const lineFields = extracted.lineItems.flatMap((li) => [
    li.description,
    li.quantity,
    li.unitPrice,
    li.lineTotal,
  ]);

  const all = [...headerFields, ...lineFields];
  return { verified: all.filter((f) => f.status === "verified").length, total: all.length };
}

/**
 * Claims and runs exactly one queued `process_invoice` job. Returns
 * {processed:false} when the queue is empty — callers loop this to drain it.
 * Never assigns a final outcome (ready_for_approval / exception_review /
 * duplicate_hold / blocked) — that requires the matching/control engine
 * this project's Phase 4 builds. This stage only extracts, aligns, and
 * arithmetic-checks; the invoice stays in "processing" either way.
 */
export async function processNextInvoiceJob(): Promise<ProcessJobResult> {
  const db = supabaseAdmin();

  const { data: claimed, error: claimError } = await db.rpc("claim_next_job", {
    p_job_type: "process_invoice",
  });
  if (claimError) throw new Error(`claim_next_job failed: ${claimError.message}`);

  const job = claimed?.[0];
  if (!job) return { processed: false };

  if (!job.invoice_id) {
    await db
      .from("jobs")
      .update({ status: "failed_permanent", last_error: "job has no invoice_id", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    return { processed: true, invoiceId: "unknown", error: "job has no invoice_id" };
  }

  const { data: invoice, error: invoiceError } = await db
    .from("invoices")
    .select("*")
    .eq("id", job.invoice_id)
    .single();

  if (invoiceError || !invoice) {
    await db
      .from("jobs")
      .update({ status: "failed_permanent", last_error: "invoice row not found", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    return { processed: true, invoiceId: job.invoice_id ?? "unknown", error: "invoice row not found" };
  }

  try {
    await db.from("invoices").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", invoice.id);

    if (!invoice.storage_path) {
      throw new Error("invoice has no storage_path — nothing to extract from");
    }

    const { data: fileBlob, error: downloadError } = await db.storage
      .from("invoice-documents")
      .download(invoice.storage_path);
    if (downloadError || !fileBlob) {
      throw new Error(`failed to download document from storage: ${downloadError?.message}`);
    }
    const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());

    await writeAuditEvent(
      db,
      invoice.workflow_id,
      invoice.id,
      "file_validated",
      "File validated",
      `${invoice.mime_type}, ${pdfBytes.byteLength} bytes, downloaded from storage.`,
      "system"
    );

    const { data: policyRow } = await db
      .from("policies")
      .select("version, config")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const policyVersion = policyRow?.version ?? "policy_2026.3";
    const config = (policyRow?.config ?? {}) as { taxRoundingToleranceUsd?: number };
    const taxRoundingToleranceUsd = config.taxRoundingToleranceUsd ?? 0.02;

    const day = new Date().toISOString().slice(0, 10);
    const dailyCapUsd = Number(process.env.DAILY_SPEND_CAP_USD ?? "5");
    const { data: reservation, error: reserveError } = await db.rpc("reserve_spend", {
      p_day: day,
      p_amount: SPEND_ESTIMATE_USD,
      p_cap: dailyCapUsd,
    });
    if (reserveError || !reservation?.[0]?.allowed) {
      throw new Error("daily spend cap reached — extraction deferred, job will retry");
    }

    let result;
    try {
      result = await extractInvoice(pdfBytes, { taxRoundingToleranceUsd });
    } catch (err) {
      await db.rpc("refund_spend", { p_day: day, p_amount: SPEND_ESTIMATE_USD });
      throw err;
    }

    const overReserved = SPEND_ESTIMATE_USD - result.costUsd;
    if (overReserved > 0) {
      await db.rpc("refund_spend", { p_day: day, p_amount: overReserved });
    }

    await writeAuditEvent(
      db,
      invoice.workflow_id,
      invoice.id,
      "extraction_complete",
      "Structured extraction complete",
      `Header and ${result.extracted.lineItems.length} line item(s) extracted to schema.`,
      "ai_model",
      result.latencyMs,
      result.costUsd
    );

    const { verified, total } = countVerified(result.extracted);
    await writeAuditEvent(
      db,
      invoice.workflow_id,
      invoice.id,
      "evidence_aligned",
      "Evidence coordinates aligned",
      `${verified} of ${total} fields aligned against the real document text layer; ${total - verified} unresolved.`,
      "system"
    );

    await writeAuditEvent(
      db,
      invoice.workflow_id,
      invoice.id,
      "arithmetic_checked",
      "Arithmetic recalculated",
      result.arithmeticControls.map((c) => c.reason).join(" "),
      "system"
    );

    const toNumeric = (v: string | null) => (v == null ? null : Number(v));

    await db
      .from("invoices")
      .update({
        extracted: result.extracted as unknown as Database["public"]["Tables"]["invoices"]["Update"]["extracted"],
        invoice_number: result.extracted.invoiceNumber.value,
        invoice_date: result.extracted.invoiceDate.value,
        due_date: result.extracted.dueDate.value,
        currency: result.extracted.currency.value,
        subtotal: toNumeric(result.extracted.subtotal.value),
        tax: toNumeric(result.extracted.tax.value),
        total: toNumeric(result.extracted.total.value),
        policy_version: policyVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    for (const control of result.arithmeticControls) {
      await db.from("controls").insert({
        invoice_id: invoice.id,
        control_id: control.controlId,
        label: control.label,
        status: control.status,
        severity: control.severity,
        reason: control.reason,
        evidence_references: control.evidenceReferences,
        blocking: control.blocking,
      });
    }

    if (result.requiresReview) {
      await writeAuditEvent(
        db,
        invoice.workflow_id,
        invoice.id,
        "extraction_requires_review",
        "Extraction requires review",
        `Required field(s) not independently verified against the document: ${result.problemFields.join(", ")}. Held here — nothing downstream may treat these as confirmed.`,
        "system"
      );
    }

    // --- Phase 4: matching, duplicate/bank-detail checks, PO/receipt matching, decision ---
    const policyConfig = parsePolicyConfig(policyRow?.config);
    const decisionResult = await decideInvoice(
      db,
      invoice.id,
      invoice.workflow_id,
      result.extracted,
      result.arithmeticControls,
      result.requiresReview,
      result.problemFields,
      policyVersion,
      policyConfig
    );

    for (const control of decisionResult.newControls) {
      if (ARITHMETIC_CONTROL_IDS.has(control.controlId)) continue; // already inserted above
      await db.from("controls").insert({
        invoice_id: invoice.id,
        control_id: control.controlId,
        label: control.label,
        status: control.status,
        severity: control.severity,
        reason: control.reason,
        evidence_references: control.evidenceReferences,
        blocking: control.blocking,
      });
    }

    const controlById = new Map(decisionResult.newControls.map((c) => [c.controlId, c]));
    const supplierControl = controlById.get("supplier_identity");
    const duplicateControl = controlById.get("duplicate_identity_check");
    const bankControl = controlById.get("bank_detail_change");
    const screeningControl = controlById.get("source_screening");
    const poRelated = decisionResult.newControls.filter((c) => c.controlId.startsWith("po_"));

    if (supplierControl) {
      await writeAuditEvent(db, invoice.workflow_id, invoice.id, "supplier_matched", "Supplier matched", supplierControl.reason, "system");
    }
    if (duplicateControl) {
      await writeAuditEvent(
        db,
        invoice.workflow_id,
        invoice.id,
        "duplicate_checked",
        decisionResult.decision.outcome === "duplicate_hold" ? "Duplicate check: exact match found" : "Duplicate check complete",
        duplicateControl.reason,
        "system"
      );
    }
    if (bankControl && bankControl.status !== "not_applicable") {
      await writeAuditEvent(
        db,
        invoice.workflow_id,
        invoice.id,
        "bank_detail_compared",
        bankControl.status === "failed" ? "Bank-detail comparison: mismatch" : "Bank-detail comparison: match",
        bankControl.reason,
        "system"
      );
    }
    if (poRelated.length > 0) {
      await writeAuditEvent(
        db,
        invoice.workflow_id,
        invoice.id,
        "po_matched",
        `PO matched — ${decisionResult.match.purchaseOrderMatch}`,
        poRelated.map((c) => c.reason).join(" "),
        "system"
      );
    }
    if (screeningControl) {
      await writeAuditEvent(
        db,
        invoice.workflow_id,
        invoice.id,
        "source_screened",
        screeningControl.status === "warning" ? "Instruction screening: FLAGGED" : "Instruction screening",
        screeningControl.reason,
        "system"
      );
    }

    await db.from("match_results").upsert(
      {
        invoice_id: invoice.id,
        supplier_id: decisionResult.match.supplierId ?? null,
        supplier_match: decisionResult.match.supplierMatch,
        purchase_order_id: decisionResult.match.purchaseOrderId ?? null,
        purchase_order_match: decisionResult.match.purchaseOrderMatch,
        receipt_ids: decisionResult.match.receiptIds,
        duplicate_candidates: decisionResult.match.duplicateCandidates as unknown as Database["public"]["Tables"]["match_results"]["Insert"]["duplicate_candidates"],
      },
      { onConflict: "invoice_id" }
    );

    await db.from("decisions").upsert(
      {
        invoice_id: invoice.id,
        workflow_id: invoice.workflow_id,
        outcome: decisionResult.decision.outcome,
        reason: decisionResult.decision.reason,
        approval_route: decisionResult.decision.approvalRoute ?? [],
        proposed_accounting_change: (decisionResult.decision.proposedAccountingChange ?? null) as unknown as Database["public"]["Tables"]["decisions"]["Insert"]["proposed_accounting_change"],
        required_actions: decisionResult.decision.requiredActions,
        policy_version: decisionResult.decision.policyVersion,
      },
      { onConflict: "invoice_id" }
    );

    await writeAuditEvent(
      db,
      invoice.workflow_id,
      invoice.id,
      "decision_made",
      `Decision: ${decisionResult.decision.outcome.replace(/_/g, " ")}`,
      decisionResult.decision.reason,
      "system"
    );

    if (decisionResult.decision.proposedAccountingChange) {
      await writeAuditEvent(
        db,
        invoice.workflow_id,
        invoice.id,
        "accounting_draft_prepared",
        "Accounting draft prepared",
        `Draft bill proposed for supplier ${decisionResult.decision.proposedAccountingChange.supplierId}, total $${decisionResult.decision.proposedAccountingChange.total} — not posted.`,
        "system"
      );
    }

    await db
      .from("invoices")
      .update({
        status: decisionResult.decision.outcome,
        supplier_id: decisionResult.match.supplierId ?? null,
        purchase_order_id: decisionResult.match.purchaseOrderId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    await db.from("jobs").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", job.id);

    return {
      processed: true,
      invoiceId: invoice.id,
      outcome: decisionResult.decision.outcome,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isPermanent = job.attempts >= job.max_attempts;

    await db
      .from("jobs")
      .update({
        status: isPermanent ? "failed_permanent" : "failed_transient",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await writeAuditEvent(
      db,
      invoice.workflow_id,
      invoice.id,
      "processing_failed",
      isPermanent ? "Processing failed permanently" : "Processing failed, will retry",
      message,
      "system"
    );

    return { processed: true, invoiceId: invoice.id, error: message };
  }
}
