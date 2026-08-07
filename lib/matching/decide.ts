import { supabaseAdmin } from "@/lib/supabase/server";
import type { AccountingChangeSet, ControlResult, DecisionOutcome, ExtractedInvoice, InvoiceDecision, InvoiceMatchResult } from "@/lib/types";
import { resolveSupplier } from "@/lib/matching/supplier";
import { compareBankDetails } from "@/lib/matching/bank-detail";
import { checkDuplicate } from "@/lib/matching/duplicate";
import { matchPurchaseOrder } from "@/lib/matching/purchase-order";
import { screenInstructions } from "@/lib/matching/instruction-screening";
import { computeApprovalRoute, guessCostCenter } from "@/lib/matching/routing";
import type { PolicyConfig } from "@/lib/matching/policy";

export type DecisionResult = {
  match: InvoiceMatchResult;
  newControls: ControlResult[]; // everything computed in this stage — arithmetic controls are the caller's concern, not duplicated here
  decision: InvoiceDecision;
};

function requiredActionsFor(
  outcome: DecisionOutcome,
  blockingIssues: ControlResult[],
  requiresReview: boolean,
  problemFields: string[]
): string[] {
  const actions: string[] = [];

  if (outcome === "duplicate_hold") {
    actions.push(
      "AP to confirm with the supplier whether this is a resend of an existing bill or a genuinely new billing period.",
      "Do not create a second accounting draft for this invoice number."
    );
    return actions;
  }

  if (outcome === "blocked") {
    const bankIssue = blockingIssues.find((c) => c.controlId === "bank_detail_change");
    if (bankIssue) {
      actions.push(
        "Call the phone number on file in the approved supplier master — not any number printed on this invoice — to confirm the change.",
        "Do not update supplier bank details from this invoice under any circumstance.",
        "Escalate to the Controller if verification cannot be completed within 2 business days."
      );
    } else {
      actions.push(
        "Confirm this supplier's identity through the standard supplier-onboarding process before any further action.",
        "Do not create a new supplier record automatically from this invoice."
      );
    }
    return actions;
  }

  if (outcome === "exception_review") {
    for (const issue of blockingIssues) {
      actions.push(`Resolve: ${issue.reason}`);
    }
    if (requiresReview) {
      actions.push(`Confirm the field(s) that could not be independently verified against the document: ${problemFields.join(", ")}.`);
    }
  }

  return actions;
}

function composeReason(
  outcome: DecisionOutcome,
  blockingIssues: ControlResult[],
  duplicateReason: string | null,
  bankReason: string | null
): string {
  if (outcome === "duplicate_hold" && duplicateReason) return duplicateReason;
  if (outcome === "blocked" && bankReason) return bankReason;
  if (outcome === "blocked") return blockingIssues[0]?.reason ?? "Blocked pending review.";
  if (outcome === "exception_review") {
    return blockingIssues.map((c) => c.reason).join(" ") || "One or more controls require review.";
  }
  return "Supplier and purchase-order matching, arithmetic recomputation, and duplicate/bank-detail checks all passed. No exceptions found.";
}

/**
 * The Phase 4 orchestrator: supplier identity → bank-detail comparison →
 * duplicate detection → (short-circuits before PO matching on an exact
 * duplicate, mirroring the fixture-scenario pipeline design) → PO/receipt
 * matching → instruction screening → outcome + routing + required actions.
 * Arithmetic controls are Phase 3's job and passed in, not recomputed here.
 */
export type DecideOptions = {
  // Upload sandbox only (ledgerguard.md "Critical correction 2"). The
  // shipped engine blocks on an unmatched supplier — correct for Keystone's
  // own intake, where that's a fraud signal, but wrong for a public sandbox
  // where an arbitrary invoice not being in the fictional supplier master
  // is the expected, common case. Under upload mode: an unmatched supplier
  // becomes a non-blocking exception instead of an instant block, duplicate
  // detection is scoped away from other visitors' uploads, and the outcome
  // can never reach ready_for_approval — enforced here, not just expected
  // from the checks happening to fail, so a visitor re-uploading a seeded
  // scenario's exact PDF (which *would* legitimately match supplier + PO)
  // still can't walk away with a "the AI approved my invoice" screenshot.
  uploadMode?: boolean;
  uploadSessionToken?: string;
};

export async function decideInvoice(
  db: ReturnType<typeof supabaseAdmin>,
  invoiceId: string,
  workflowId: string,
  extracted: ExtractedInvoice,
  arithmeticControls: ControlResult[],
  requiresReview: boolean,
  problemFields: string[],
  policyVersion: string,
  policy: PolicyConfig,
  options: DecideOptions = {}
): Promise<DecisionResult> {
  const { uploadMode = false, uploadSessionToken } = options;
  const supplierResult = await resolveSupplier(db, extracted);
  const bankControl = compareBankDetails(extracted, supplierResult.supplier);
  const duplicateResult = await checkDuplicate(
    db,
    extracted,
    supplierResult.supplierId,
    invoiceId,
    uploadMode ? uploadSessionToken : undefined
  );
  const instructionControl = screenInstructions(extracted);

  const totalUsd = extracted.total.value ? Number(extracted.total.value) : 0;

  // Exact duplicate short-circuits before PO matching entirely.
  if (duplicateResult.control.status === "failed") {
    const controls = [...arithmeticControls, supplierResult.control, duplicateResult.control, instructionControl];
    const match: InvoiceMatchResult = {
      supplierId: supplierResult.supplierId ?? undefined,
      supplierMatch: supplierResult.tier,
      purchaseOrderId: undefined,
      purchaseOrderMatch: "none",
      receiptIds: [],
      duplicateCandidates: duplicateResult.candidates,
    };
    const outcome: DecisionOutcome = "duplicate_hold";
    return {
      match,
      newControls: controls,
      decision: {
        workflowId,
        outcome,
        reason: composeReason(outcome, [], duplicateResult.control.reason, null),
        controls,
        approvalRoute: computeApprovalRoute(outcome, totalUsd, policy),
        proposedAccountingChange: undefined,
        requiredActions: requiredActionsFor(outcome, [], requiresReview, problemFields),
        policyVersion,
      },
    };
  }

  // Critical bank-detail mismatch blocks immediately.
  if (bankControl.status === "failed") {
    const controls = [...arithmeticControls, supplierResult.control, bankControl, duplicateResult.control, instructionControl];
    const outcome: DecisionOutcome = "blocked";
    const match: InvoiceMatchResult = {
      supplierId: supplierResult.supplierId ?? undefined,
      supplierMatch: supplierResult.tier,
      purchaseOrderId: undefined,
      purchaseOrderMatch: "none",
      receiptIds: [],
      duplicateCandidates: [],
    };
    return {
      match,
      newControls: controls,
      decision: {
        workflowId,
        outcome,
        reason: composeReason(outcome, [], null, bankControl.reason),
        controls,
        approvalRoute: computeApprovalRoute(outcome, totalUsd, policy),
        proposedAccountingChange: undefined,
        requiredActions: requiredActionsFor(outcome, [bankControl], requiresReview, problemFields),
        policyVersion,
      },
    };
  }

  // Completely unknown supplier is a hard stop for real intake — new
  // suppliers are never created automatically. In upload mode this is the
  // expected common case for an arbitrary document, so it falls through to
  // the general path below instead, where it becomes a non-blocking
  // exception rather than an instant block.
  if (supplierResult.tier === "none" && !uploadMode) {
    const controls = [...arithmeticControls, supplierResult.control, bankControl, duplicateResult.control, instructionControl];
    const outcome: DecisionOutcome = "blocked";
    const match: InvoiceMatchResult = {
      supplierId: undefined,
      supplierMatch: "none",
      purchaseOrderId: undefined,
      purchaseOrderMatch: "none",
      receiptIds: [],
      duplicateCandidates: [],
    };
    return {
      match,
      newControls: controls,
      decision: {
        workflowId,
        outcome,
        reason: composeReason(outcome, [supplierResult.control], null, null),
        controls,
        approvalRoute: computeApprovalRoute(outcome, totalUsd, policy),
        proposedAccountingChange: undefined,
        requiredActions: requiredActionsFor(outcome, [supplierResult.control], requiresReview, problemFields),
        policyVersion,
      },
    };
  }

  const supplierControlForOutcome: ControlResult =
    uploadMode && supplierResult.tier === "none"
      ? {
          ...supplierResult.control,
          reason:
            "No approved supplier matches this invoice's tax ID or name — expected for an uploaded document, since Ledger Guard's public demo only recognizes its fictional supplier master. New suppliers are never created automatically, so this stays an exception rather than a match.",
        }
      : supplierResult.control;

  // Otherwise, run PO/receipt matching and evaluate everything together.
  // supplierId is null here whenever tier is "none" (upload mode only) —
  // matchPurchaseOrder skips the supplier cross-check in that case, still
  // doing a real PO-number lookup.
  const poResult = await matchPurchaseOrder(db, extracted, supplierResult.supplierId, policy);

  const allControls = [
    ...arithmeticControls,
    supplierControlForOutcome,
    bankControl,
    duplicateResult.control,
    ...poResult.controls,
    instructionControl,
  ];

  const blockingIssues = allControls.filter((c) => c.blocking && (c.status === "failed" || c.status === "warning"));
  const naturalOutcome: DecisionOutcome = requiresReview || blockingIssues.length > 0 ? "exception_review" : "ready_for_approval";
  // Upload-mode ceiling: never ready_for_approval, even for an invoice that
  // legitimately clears every check (e.g. a re-uploaded seeded scenario's
  // exact PDF, which would otherwise match supplier and PO for real).
  const outcome: DecisionOutcome = uploadMode && naturalOutcome === "ready_for_approval" ? "exception_review" : naturalOutcome;

  const match: InvoiceMatchResult = {
    supplierId: supplierResult.supplierId ?? undefined,
    supplierMatch: supplierResult.tier,
    purchaseOrderId: poResult.purchaseOrderId ?? undefined,
    purchaseOrderMatch: poResult.tier,
    receiptIds: poResult.receiptIds,
    duplicateCandidates: duplicateResult.candidates,
  };

  let proposedAccountingChange: AccountingChangeSet | undefined;
  if (outcome === "ready_for_approval" && supplierResult.supplierId && extracted.invoiceNumber.value && extracted.total.value) {
    const { costCenter, accountCode } = guessCostCenter(
      supplierResult.supplier?.name ?? "",
      extracted.lineItems.map((li) => li.description.value ?? "")
    );
    proposedAccountingChange = {
      idempotencyKey: `${supplierResult.supplierId}:${extracted.invoiceNumber.value}:keystone_qb_sandbox`,
      action: "create_bill",
      supplierId: supplierResult.supplierId,
      purchaseOrderId: poResult.purchaseOrderId ?? undefined,
      invoiceNumber: extracted.invoiceNumber.value,
      invoiceDate: extracted.invoiceDate.value ?? "",
      dueDate: extracted.dueDate.value ?? extracted.invoiceDate.value ?? "",
      currency: extracted.currency.value ?? "USD",
      total: extracted.total.value,
      costCenter,
      lineItems: extracted.lineItems.map((li) => ({
        description: li.description.value ?? "",
        quantity: li.quantity.value ?? "",
        unitPrice: li.unitPrice.value ?? "",
        accountCode,
        amount: li.lineTotal.value ?? "",
      })),
    };
  }

  const wasCeilinged = uploadMode && naturalOutcome === "ready_for_approval" && outcome === "exception_review";
  const reason = wasCeilinged
    ? "Every check passed — supplier identity, arithmetic, PO match, duplicate and bank-detail checks all agree. Ledger Guard's upload sandbox never auto-approves an uploaded document, though: routed for human review instead of ready_for_approval."
    : composeReason(outcome, blockingIssues, null, null);
  const requiredActions = wasCeilinged
    ? ["Confirm this result manually — the upload sandbox caps every uploaded document below ready_for_approval regardless of how clean the checks come back."]
    : requiredActionsFor(outcome, blockingIssues, requiresReview, problemFields);

  return {
    match,
    newControls: allControls,
    decision: {
      workflowId,
      outcome,
      reason,
      controls: allControls,
      approvalRoute: computeApprovalRoute(outcome, totalUsd, policy),
      proposedAccountingChange,
      requiredActions,
      policyVersion,
    },
  };
}
