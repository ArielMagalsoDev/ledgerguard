// Core data interfaces — ported verbatim from CLAUDE.md section 11.
// Monetary values are decimal strings everywhere. Never JS floats for money.

export type InvoiceSubmission = {
  submissionId: string;
  source: "email" | "upload" | "shared_folder" | "demo_scenario";
  originalFileName: string;
  fileHash: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  receivedAt: string;
  senderEmail?: string;
};

export type FieldStatus = "verified" | "uncertain" | "conflicting" | "missing";

export type Evidence = {
  page: number; // 1-based
  text: string; // must appear verbatim in the rendered document lines
  boundingBox: [number, number, number, number]; // [x0,y0,x1,y1], normalized 0-1, top-left origin
};

export type ExtractedField<T> = {
  field: string;
  value: T | null;
  normalizedValue?: string;
  confidence: number;
  status: FieldStatus;
  evidence: Evidence[];
};

export type InvoiceLineItem = {
  lineNumber: number;
  description: ExtractedField<string>;
  quantity: ExtractedField<string>;
  unitPrice: ExtractedField<string>;
  taxRate?: ExtractedField<string>;
  lineTotal: ExtractedField<string>;
};

export type ExtractedInvoice = {
  invoiceNumber: ExtractedField<string>;
  invoiceDate: ExtractedField<string>;
  dueDate: ExtractedField<string>;
  supplierName: ExtractedField<string>;
  supplierTaxId: ExtractedField<string>;
  purchaseOrderNumber: ExtractedField<string>;
  currency: ExtractedField<string>;
  subtotal: ExtractedField<string>;
  tax: ExtractedField<string>;
  total: ExtractedField<string>;
  remittanceDetails?: ExtractedField<string>;
  notes?: ExtractedField<string>; // untrusted free text; screened, never acted on
  lineItems: InvoiceLineItem[];
};

export type ControlSeverity = "low" | "medium" | "high" | "critical";
export type ControlStatus = "passed" | "failed" | "warning" | "not_applicable";

export type ControlResult = {
  controlId: string;
  label: string;
  status: ControlStatus;
  severity: ControlSeverity;
  reason: string;
  evidenceReferences: string[];
  blocking: boolean;
};

export type MatchTier = "exact" | "probable" | "ambiguous" | "none";
export type PoMatchTier = "exact" | "partial" | "ambiguous" | "none";

export type DuplicateCandidate = {
  existingInvoiceId: string;
  matchType: "exact" | "probable";
  matchedSignals: string[];
};

export type InvoiceMatchResult = {
  supplierId?: string;
  supplierMatch: MatchTier;
  purchaseOrderId?: string;
  purchaseOrderMatch: PoMatchTier;
  receiptIds: string[];
  duplicateCandidates: DuplicateCandidate[];
};

export type AccountingChangeSet = {
  idempotencyKey: string;
  action: "create_bill" | "update_draft" | "none";
  supplierId: string;
  purchaseOrderId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  total: string;
  costCenter: string;
  lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    accountCode: string;
    amount: string;
  }>;
};

export type DecisionOutcome =
  | "ready_for_approval"
  | "exception_review"
  | "duplicate_hold"
  | "blocked";

export type InvoiceDecision = {
  workflowId: string;
  outcome: DecisionOutcome;
  reason: string;
  controls: ControlResult[];
  approvalRoute?: string[];
  proposedAccountingChange?: AccountingChangeSet;
  requiredActions: string[];
  policyVersion: string;
};

// --- Demo-only supporting types (Phase 1 static fixtures; becomes DB-backed in Phase 2) ---

export type SupplierMaster = {
  id: string;
  name: string;
  taxId: string;
  approvedDomain: string;
  status: "approved" | "pending" | "suspended";
  bankOnFile: {
    bankName: string;
    accountLast4: string;
    routingLast4: string;
    verifiedAt: string;
  };
};

export type PurchaseOrderLine = {
  sku?: string;
  description: string;
  approvedQuantity: number;
  unitPrice: string;
};

export type PurchaseOrderRecord = {
  id: string;
  number: string;
  supplierId: string;
  property: string;
  currency: string;
  status: "open" | "closed" | "cancelled";
  issuedDate: string;
  notToExceed: string;
  lines: PurchaseOrderLine[];
};

export type ReceiptRecord = {
  id: string;
  purchaseOrderId: string;
  receivedDate: string;
  receivedBy: string;
  lines: Array<{ sku?: string; description: string; quantityReceived: number }>;
};

export type ExistingInvoiceRecord = {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: string;
  originalFileName: string;
  recordedAt: string;
};

export type AuditActor = "system" | "ai_model" | "human";

export type AuditEvent = {
  id: string;
  timestamp: string;
  stage: string;
  label: string;
  detail: string;
  actor: AuditActor;
  latencyMs?: number;
  costUsd?: number;
};

export type InvoiceDocumentLine = {
  id: string;
  text: string;
  kind: "header" | "meta" | "table-header" | "line-item" | "totals" | "notes" | "footer";
};

export type DemoScenario = {
  id: string;
  order: number;
  outcome: DecisionOutcome;
  title: string;
  shortLabel: string;
  tagline: string;
  submission: InvoiceSubmission;
  documentLines: InvoiceDocumentLine[];
  extracted: ExtractedInvoice;
  supplier: SupplierMaster;
  purchaseOrder?: PurchaseOrderRecord;
  receipt?: ReceiptRecord;
  duplicateOf?: ExistingInvoiceRecord;
  match: InvoiceMatchResult;
  controls: ControlResult[];
  decision: InvoiceDecision;
  auditEvents: AuditEvent[];
  narrative: {
    whatHappened: string;
    whyItMatters: string;
  };
};
