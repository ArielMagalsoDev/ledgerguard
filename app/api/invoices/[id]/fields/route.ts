import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseDecimalToCents } from "@/lib/money";
import { computeArithmeticControls } from "@/lib/extraction/arithmetic";
import { validateRequiredFields } from "@/lib/extraction/validate";
import { decideInvoice } from "@/lib/matching/decide";
import { parsePolicyConfig } from "@/lib/matching/policy";
import type { ExtractedField, ExtractedInvoice } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

const HEADER_FIELDS = [
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "supplierName",
  "supplierTaxId",
  "purchaseOrderNumber",
  "currency",
  "subtotal",
  "tax",
  "total",
  "remittanceDetails",
] as const;

const LINE_FIELDS = ["description", "quantity", "unitPrice", "lineTotal"] as const;
const MONETARY_FIELDS = new Set(["subtotal", "tax", "total", "unitPrice", "lineTotal"]);

const correctionSchema = z.object({
  field: z.enum([...HEADER_FIELDS, ...LINE_FIELDS]),
  value: z.string().min(1),
  lineNumber: z.number().int().optional(),
});

/**
 * Human field-level correction. This is the actual enforcement boundary the
 * spec's Phase 3 "field-level review and correction" line refers to — a
 * corrected value is marked verified with full confidence and audited with
 * actor "human"; it never silently inherits the model's original claim.
 *
 * Phase 6 addition: a correction is only useful to a reviewer if it can
 * actually change the outcome, so this now re-runs arithmetic + the full
 * decision engine (supplier/duplicate/bank-detail/PO matching) afterward
 * and writes a fresh decisions/match_results/controls set — same as the
 * job processor's own tail, just triggered by a human edit instead of a
 * freshly-extracted invoice. Original extraction/control history is never
 * deleted from audit_events, only from the mutable `controls` table (which
 * has always represented "current controls," not a history log — the
 * append-only audit trail is what preserves history).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = correctionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { field, value, lineNumber } = parsed.data;

  if (MONETARY_FIELDS.has(field) && field !== "quantity" && parseDecimalToCents(value) === null) {
    return NextResponse.json({ error: "invalid_monetary_value" }, { status: 400 });
  }
  if (field === "quantity" && !Number.isFinite(Number(value))) {
    return NextResponse.json({ error: "invalid_quantity_value" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: invoice, error: fetchError } = await db
    .from("invoices")
    .select("id, workflow_id, extracted, policy_version")
    .eq("id", id)
    .single();

  if (fetchError || !invoice) {
    return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
  }

  const extracted = invoice.extracted as unknown as ExtractedInvoice;
  const correctedField: ExtractedField<string> = {
    field,
    value,
    normalizedValue: undefined,
    confidence: 1,
    status: "verified",
    evidence: [],
  };

  let detail: string;

  if ((LINE_FIELDS as readonly string[]).includes(field)) {
    if (lineNumber == null) {
      return NextResponse.json({ error: "line_number_required" }, { status: 400 });
    }
    const line = extracted.lineItems.find((li) => li.lineNumber === lineNumber);
    if (!line) {
      return NextResponse.json({ error: "line_not_found" }, { status: 404 });
    }
    (line as unknown as Record<string, ExtractedField<string>>)[field] = correctedField;
    detail = `Line ${lineNumber} field "${field}" corrected by a human reviewer to "${value}".`;
  } else {
    (extracted as unknown as Record<string, ExtractedField<string>>)[field] = correctedField;
    detail = `Field "${field}" corrected by a human reviewer to "${value}".`;
  }

  const normalizedColumnUpdate: Record<string, string> = {};
  if (field === "invoiceNumber") normalizedColumnUpdate.invoice_number = value;
  if (field === "invoiceDate") normalizedColumnUpdate.invoice_date = value;
  if (field === "dueDate") normalizedColumnUpdate.due_date = value;
  if (field === "currency") normalizedColumnUpdate.currency = value;
  if (field === "subtotal") normalizedColumnUpdate.subtotal = value;
  if (field === "tax") normalizedColumnUpdate.tax = value;
  if (field === "total") normalizedColumnUpdate.total = value;

  const { error: updateError } = await db
    .from("invoices")
    .update({ extracted, ...normalizedColumnUpdate, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "update_failed", message: updateError.message }, { status: 500 });
  }

  await db.from("audit_events").insert({
    workflow_id: invoice.workflow_id,
    invoice_id: id,
    event_id: `${id}:field_corrected:${Date.now()}`,
    stage: "field_corrected",
    label: "Field corrected",
    detail,
    actor: "human",
  });

  // --- Recompute: arithmetic, then the full decision engine ---
  const { data: policyRow } = await db
    .from("policies")
    .select("version, config")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const policyVersion = policyRow?.version ?? invoice.policy_version ?? "policy_2026.3";
  const policyConfig = parsePolicyConfig(policyRow?.config);

  const validation = validateRequiredFields(extracted);
  const arithmeticControls = computeArithmeticControls(extracted, { taxRoundingToleranceUsd: policyConfig.taxRoundingToleranceUsd });

  const { data: existingDecision } = await db.from("decisions").select("outcome, workflow_id").eq("invoice_id", id).maybeSingle();
  const previousOutcome = existingDecision?.outcome ?? null;

  const decisionResult = await decideInvoice(
    db,
    id,
    invoice.workflow_id,
    extracted,
    arithmeticControls,
    validation.requiresReview,
    validation.problemFields,
    policyVersion,
    policyConfig
  );

  // `controls` has always represented "current controls," not a history log
  // (the append-only audit_events trail is what preserves history) — safe
  // to replace wholesale with the freshly recomputed set.
  await db.from("controls").delete().eq("invoice_id", id);
  for (const control of decisionResult.newControls) {
    await db.from("controls").insert({
      invoice_id: id,
      control_id: control.controlId,
      label: control.label,
      status: control.status,
      severity: control.severity,
      reason: control.reason,
      evidence_references: control.evidenceReferences,
      blocking: control.blocking,
    });
  }

  await db.from("match_results").upsert(
    {
      invoice_id: id,
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
      invoice_id: id,
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

  await db
    .from("invoices")
    .update({
      status: decisionResult.decision.outcome,
      supplier_id: decisionResult.match.supplierId ?? null,
      purchase_order_id: decisionResult.match.purchaseOrderId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await db.from("audit_events").insert({
    workflow_id: invoice.workflow_id,
    invoice_id: id,
    event_id: `${id}:decision_recomputed:${Date.now()}`,
    stage: "decision_recomputed",
    label: "Decision recomputed after correction",
    detail:
      previousOutcome && previousOutcome !== decisionResult.decision.outcome
        ? `Outcome changed from "${previousOutcome}" to "${decisionResult.decision.outcome}" after the correction above. ${decisionResult.decision.reason}`
        : `Outcome remains "${decisionResult.decision.outcome}" after the correction above. ${decisionResult.decision.reason}`,
    actor: "system",
  });

  return NextResponse.json({
    ok: true,
    field,
    lineNumber,
    value,
    outcome: decisionResult.decision.outcome,
    previousOutcome,
  });
}
