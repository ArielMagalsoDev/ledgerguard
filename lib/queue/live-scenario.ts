// Phase 6: makes /demo show REAL pipeline output instead of only the static
// lib/fixtures/scenarios.ts object. `npm run run-demo-pipeline` tags each
// submission with `scenarioKey` (see lib/types.ts); this module finds the
// most recent live invoice for a given key and overlays its real
// extraction/match/control/decision/audit data onto the fixture. Curated
// presentational content that has no DB equivalent — documentLines (the
// rendered "PDF" text), narrative copy, title/tagline/order — always comes
// from the fixture; only the pipeline's actual computed output is live.
//
// If no live row exists yet for a scenario (fresh environment, pipeline
// never run), this falls back to the fixture entirely so the page never
// breaks — `isLive` tells the caller which happened.
import { supabaseAdmin } from "@/lib/supabase/server";
import { SCENARIOS } from "@/lib/fixtures/scenarios";
import type {
  AccountingChangeSet,
  AuditEvent,
  ControlResult,
  DecisionOutcome,
  DemoScenario,
  DuplicateCandidate,
  ExistingInvoiceRecord,
  ExtractedInvoice,
  InvoiceDecision,
  InvoiceMatchResult,
  MatchTier,
  PoMatchTier,
  PurchaseOrderRecord,
  ReceiptRecord,
  SupplierMaster,
} from "@/lib/types";

type Db = ReturnType<typeof supabaseAdmin>;

export function mapControl(row: {
  control_id: string;
  label: string;
  status: string;
  severity: string;
  reason: string;
  evidence_references: unknown;
  blocking: boolean;
}): ControlResult {
  return {
    controlId: row.control_id,
    label: row.label,
    status: row.status as ControlResult["status"],
    severity: row.severity as ControlResult["severity"],
    reason: row.reason,
    evidenceReferences: (row.evidence_references as string[] | null) ?? [],
    blocking: row.blocking,
  };
}

export function mapAuditEvent(row: {
  id: string;
  timestamp: string;
  stage: string;
  label: string;
  detail: string;
  actor: string;
  latency_ms: number | null;
  cost_usd: number | null;
}): AuditEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    stage: row.stage,
    label: row.label,
    detail: row.detail,
    actor: row.actor as AuditEvent["actor"],
    latencyMs: row.latency_ms ?? undefined,
    costUsd: row.cost_usd ?? undefined,
  };
}

export function mapSupplier(row: {
  id: string;
  name: string;
  tax_id: string;
  approved_domain: string | null;
  status: string;
  bank_name: string | null;
  bank_account_last4: string | null;
  bank_routing_last4: string | null;
  bank_verified_at: string | null;
}): SupplierMaster {
  return {
    id: row.id,
    name: row.name,
    taxId: row.tax_id,
    approvedDomain: row.approved_domain ?? "",
    status: row.status as SupplierMaster["status"],
    bankOnFile: {
      bankName: row.bank_name ?? "",
      accountLast4: row.bank_account_last4 ?? "",
      routingLast4: row.bank_routing_last4 ?? "",
      verifiedAt: row.bank_verified_at ?? "",
    },
  };
}

export function mapPurchaseOrder(
  row: { id: string; po_number: string; supplier_id: string; property_code: string; currency: string; status: string; issued_date: string; not_to_exceed: number },
  lines: Array<{ sku: string | null; description: string; approved_quantity: number; unit_price: number }>
): PurchaseOrderRecord {
  return {
    id: row.id,
    number: row.po_number,
    supplierId: row.supplier_id,
    property: row.property_code,
    currency: row.currency,
    status: row.status as PurchaseOrderRecord["status"],
    issuedDate: row.issued_date,
    notToExceed: String(row.not_to_exceed),
    lines: lines.map((l) => ({
      sku: l.sku ?? undefined,
      description: l.description,
      approvedQuantity: l.approved_quantity,
      unitPrice: String(l.unit_price),
    })),
  };
}

export function mapReceipt(
  row: { id: string; purchase_order_id: string; received_date: string; received_by: string },
  lines: Array<{ sku: string | null; description: string; quantity_received: number }>
): ReceiptRecord {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    receivedDate: row.received_date,
    receivedBy: row.received_by,
    lines: lines.map((l) => ({ sku: l.sku ?? undefined, description: l.description, quantityReceived: l.quantity_received })),
  };
}

export function mapExistingInvoice(row: {
  id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  original_file_name: string;
  created_at: string;
}): ExistingInvoiceRecord {
  return {
    id: row.id,
    supplierId: row.supplier_id ?? "",
    invoiceNumber: row.invoice_number ?? "",
    invoiceDate: row.invoice_date ?? "",
    total: row.total != null ? String(row.total) : "",
    originalFileName: row.original_file_name,
    recordedAt: row.created_at,
  };
}

export async function fetchPurchaseOrder(db: Db, purchaseOrderId: string): Promise<PurchaseOrderRecord | undefined> {
  const [{ data: po }, { data: lines }] = await Promise.all([
    db.from("purchase_orders").select("*").eq("id", purchaseOrderId).maybeSingle(),
    db.from("po_lines").select("*").eq("purchase_order_id", purchaseOrderId).order("line_number"),
  ]);
  if (!po) return undefined;
  return mapPurchaseOrder(po, lines ?? []);
}

export async function fetchReceipt(db: Db, receiptId: string): Promise<ReceiptRecord | undefined> {
  const [{ data: receipt }, { data: lines }] = await Promise.all([
    db.from("receipts").select("*").eq("id", receiptId).maybeSingle(),
    db.from("receipt_lines").select("*").eq("receipt_id", receiptId),
  ]);
  if (!receipt) return undefined;
  return mapReceipt(receipt, lines ?? []);
}

/**
 * Fetches the most recent processed invoice tagged with `scenarioKey` and
 * overlays its real data onto the matching static fixture. Returns the
 * fixture unchanged (isLive: false) when no live row exists yet.
 */
export async function getLiveScenario(scenarioKey: string): Promise<{ scenario: DemoScenario; isLive: boolean }> {
  const fixture = SCENARIOS.find((s) => s.id === scenarioKey);
  if (!fixture) throw new Error(`Unknown scenario key "${scenarioKey}"`);

  const db = supabaseAdmin();
  const { data: invoice } = await db
    .from("invoices")
    .select("*")
    .eq("scenario_key", scenarioKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invoice || !invoice.extracted || Object.keys(invoice.extracted as object).length === 0) {
    return { scenario: fixture, isLive: false };
  }

  const [{ data: controlRows }, { data: matchRow }, { data: decisionRow }, { data: auditRows }] = await Promise.all([
    db.from("controls").select("*").eq("invoice_id", invoice.id),
    db.from("match_results").select("*").eq("invoice_id", invoice.id).maybeSingle(),
    db.from("decisions").select("*").eq("invoice_id", invoice.id).maybeSingle(),
    db.from("audit_events").select("*").eq("invoice_id", invoice.id).order("timestamp"),
  ]);

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
  const outcome = (decisionRow?.outcome as DecisionOutcome | undefined) ?? (invoice.status as DecisionOutcome) ?? fixture.outcome;

  const match: InvoiceMatchResult = matchRow
    ? {
        supplierId: matchRow.supplier_id ?? undefined,
        supplierMatch: matchRow.supplier_match as MatchTier,
        purchaseOrderId: matchRow.purchase_order_id ?? undefined,
        purchaseOrderMatch: matchRow.purchase_order_match as PoMatchTier,
        receiptIds: (matchRow.receipt_ids as string[] | null) ?? [],
        duplicateCandidates,
      }
    : fixture.match;

  const decision: InvoiceDecision = decisionRow
    ? {
        workflowId: decisionRow.workflow_id,
        outcome,
        reason: decisionRow.reason,
        controls,
        approvalRoute: (decisionRow.approval_route as string[] | null) ?? [],
        proposedAccountingChange: (decisionRow.proposed_accounting_change as AccountingChangeSet | null) ?? undefined,
        requiredActions: (decisionRow.required_actions as string[] | null) ?? [],
        policyVersion: decisionRow.policy_version,
      }
    : fixture.decision;

  const scenario: DemoScenario = {
    ...fixture,
    outcome,
    submission: {
      ...fixture.submission,
      submissionId: invoice.submission_id,
      receivedAt: invoice.received_at,
    },
    extracted: invoice.extracted as unknown as ExtractedInvoice,
    supplier: supplierRow ? mapSupplier(supplierRow) : fixture.supplier,
    purchaseOrder: purchaseOrder ?? fixture.purchaseOrder,
    receipt: receipt ?? fixture.receipt,
    duplicateOf: duplicateOfRow ? mapExistingInvoice(duplicateOfRow) : undefined,
    match,
    controls: controls.length > 0 ? controls : fixture.controls,
    decision,
    auditEvents: (auditRows ?? []).length > 0 ? (auditRows ?? []).map(mapAuditEvent) : fixture.auditEvents,
  };

  return { scenario, isLive: true };
}

export async function getAllLiveScenarios(): Promise<Array<{ scenario: DemoScenario; isLive: boolean }>> {
  return Promise.all(SCENARIOS.map((s) => getLiveScenario(s.id)));
}
