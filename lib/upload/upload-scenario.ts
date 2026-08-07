// Upload sandbox — assembles a `DemoScenario`-shaped object for an
// arbitrary uploaded invoice, the same shape lib/queue/live-scenario.ts
// builds for the five seeded scenarios, so the existing result panels
// (ExtractedDataPanel, MatchEvidencePanel, ControlChecklist,
// ProposedActionPanel, AuditTrail) can render it unmodified — the plan's
// "point the workbench at the session invoice" instruction, made literal.
// Unlike getLiveScenario, there's no fixture to fall back to or overlay
// onto: every field here comes from the live DB row, because there's no
// other source of truth for a document nobody curated in advance.
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  mapControl,
  mapAuditEvent,
  mapSupplier,
  mapExistingInvoice,
  fetchPurchaseOrder,
  fetchReceipt,
} from "@/lib/queue/live-scenario";
import type {
  AccountingChangeSet,
  DecisionOutcome,
  DemoScenario,
  DuplicateCandidate,
  ExtractedInvoice,
  InvoiceDecision,
  InvoiceMatchResult,
  MatchTier,
  PoMatchTier,
  SupplierMaster,
} from "@/lib/types";

type Db = ReturnType<typeof supabaseAdmin>;

// ledgerguard.md's security requirements: mask full bank account/routing
// numbers before they ever reach the browser. The seeded demo fixtures
// already only ever print "...ending 1234"-style values by construction,
// so this doesn't apply there — but an arbitrary uploaded invoice is real
// third-party content that may print full digit runs verbatim, in both the
// extracted value and its source quote.
function redactDigitRuns(text: string): string {
  return text.replace(/\d{5,}/g, (run) => "•".repeat(Math.max(0, run.length - 4)) + run.slice(-4));
}

function redactRemittanceField(field: ExtractedInvoice["remittanceDetails"]): ExtractedInvoice["remittanceDetails"] {
  if (!field) return field;
  return {
    ...field,
    value: field.value ? redactDigitRuns(field.value) : field.value,
    normalizedValue: field.normalizedValue ? redactDigitRuns(field.normalizedValue) : field.normalizedValue,
    evidence: field.evidence.map((e) => ({ ...e, text: redactDigitRuns(e.text) })),
  };
}

// Rendered when supplier tier is "none" — the common, honest case for an
// arbitrary uploaded document (ledgerguard.md's "honest product behavior").
// Every field reads as visibly absent rather than silently blank.
const UNMATCHED_SUPPLIER: SupplierMaster = {
  id: "unmatched",
  name: "Not matched to an approved supplier",
  taxId: "—",
  approvedDomain: "",
  status: "pending",
  bankOnFile: { bankName: "", accountLast4: "", routingLast4: "", verifiedAt: "" },
};

export type UploadScenarioStatus =
  | { state: "not_found" }
  | { state: "expired" }
  | { state: "processing" }
  | { state: "ready"; scenario: DemoScenario; expiresAt: string; originalFileName: string; storagePath: string | null };

/**
 * Loads one upload invoice by id, scoped to the owning session token so a
 * visitor can never fetch another visitor's result by guessing an id.
 * Returns a small state machine rather than throwing, since "not found",
 * "expired", and "still processing" are all expected, distinct UI states —
 * not error conditions.
 */
export async function getUploadScenario(invoiceId: string, sessionToken: string): Promise<UploadScenarioStatus> {
  const db: Db = supabaseAdmin();

  const { data: invoice } = await db
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("source", "upload")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (!invoice) return { state: "not_found" };
  if (invoice.expires_at && new Date(invoice.expires_at) < new Date()) return { state: "expired" };

  const [{ data: controlRows }, { data: matchRow }, { data: decisionRow }, { data: auditRows }] = await Promise.all([
    db.from("controls").select("*").eq("invoice_id", invoice.id),
    db.from("match_results").select("*").eq("invoice_id", invoice.id).maybeSingle(),
    db.from("decisions").select("*").eq("invoice_id", invoice.id).maybeSingle(),
    db.from("audit_events").select("*").eq("invoice_id", invoice.id).order("timestamp"),
  ]);

  if (!decisionRow || !invoice.extracted || Object.keys(invoice.extracted as object).length === 0) {
    return { state: "processing" };
  }

  const supplierId = invoice.supplier_id ?? matchRow?.supplier_id ?? null;
  const purchaseOrderId = invoice.purchase_order_id ?? matchRow?.purchase_order_id ?? null;
  const firstReceiptId = (matchRow?.receipt_ids as string[] | null)?.[0] ?? null;
  const duplicateCandidates = (matchRow?.duplicate_candidates as DuplicateCandidate[] | null) ?? [];
  const firstDuplicateId = duplicateCandidates[0]?.existingInvoiceId ?? null;

  const [supplierRow, purchaseOrder, receipt, duplicateOfRow] = await Promise.all([
    supplierId ? db.from("suppliers").select("*").eq("id", supplierId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    purchaseOrderId ? fetchPurchaseOrder(db, purchaseOrderId) : Promise.resolve(undefined),
    firstReceiptId ? fetchReceipt(db, firstReceiptId) : Promise.resolve(undefined),
    firstDuplicateId ? db.from("invoices").select("*").eq("id", firstDuplicateId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);

  const controls = (controlRows ?? []).map(mapControl);
  const outcome = decisionRow.outcome as DecisionOutcome;
  const rawExtracted = invoice.extracted as unknown as ExtractedInvoice;
  const extracted: ExtractedInvoice = {
    ...rawExtracted,
    remittanceDetails: redactRemittanceField(rawExtracted.remittanceDetails),
  };

  const match: InvoiceMatchResult = {
    supplierId: matchRow?.supplier_id ?? undefined,
    supplierMatch: (matchRow?.supplier_match as MatchTier | undefined) ?? "none",
    purchaseOrderId: matchRow?.purchase_order_id ?? undefined,
    purchaseOrderMatch: (matchRow?.purchase_order_match as PoMatchTier | undefined) ?? "none",
    receiptIds: (matchRow?.receipt_ids as string[] | null) ?? [],
    duplicateCandidates,
  };

  const decision: InvoiceDecision = {
    workflowId: decisionRow.workflow_id,
    outcome,
    reason: decisionRow.reason,
    controls,
    approvalRoute: (decisionRow.approval_route as string[] | null) ?? [],
    proposedAccountingChange: (decisionRow.proposed_accounting_change as AccountingChangeSet | null) ?? undefined,
    requiredActions: (decisionRow.required_actions as string[] | null) ?? [],
    policyVersion: decisionRow.policy_version,
  };

  const displayName = extracted.supplierName.value ?? invoice.original_file_name;
  const scenario: DemoScenario = {
    id: `upload:${invoice.id}`,
    order: 0,
    outcome,
    title: displayName,
    shortLabel: "Your upload",
    tagline: extracted.invoiceNumber.value ? `Invoice ${extracted.invoiceNumber.value}` : invoice.original_file_name,
    submission: {
      submissionId: invoice.submission_id,
      source: "upload",
      originalFileName: invoice.original_file_name,
      fileHash: invoice.file_hash,
      mimeType: "application/pdf",
      receivedAt: invoice.received_at,
    },
    documentLines: [], // real uploaded PDF is rendered directly, not from curated fixture lines
    extracted,
    supplier: supplierRow ? mapSupplier(supplierRow) : UNMATCHED_SUPPLIER,
    purchaseOrder,
    receipt,
    duplicateOf: duplicateOfRow ? mapExistingInvoice(duplicateOfRow) : undefined,
    match,
    controls,
    decision,
    auditEvents: (auditRows ?? []).map(mapAuditEvent),
    narrative: {
      whatHappened: decision.reason,
      whyItMatters:
        "This is your own document, run through the same real extraction, evidence-alignment, and control pipeline as the five seeded scenarios — under the upload sandbox's policy, which never auto-approves an uploaded document and treats an unrecognized supplier as an honest exception rather than a fabricated match.",
    },
  };

  return {
    state: "ready",
    scenario,
    expiresAt: invoice.expires_at ?? "",
    originalFileName: invoice.original_file_name,
    storagePath: invoice.storage_path,
  };
}
