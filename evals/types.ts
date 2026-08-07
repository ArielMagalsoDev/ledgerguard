import type { DecisionOutcome, InvoiceDocumentLine, MatchTier, PoMatchTier } from "@/lib/types";

export type EvalCategory =
  | "clean_match"
  | "price_quantity_exception"
  | "arithmetic_tax_failure"
  | "duplicate"
  | "supplier_bank_detail"
  | "ambiguous_scan"
  | "adversarial_injection";

// "dev" cases are fair game for tuning prompts/thresholds against. "held_out"
// cases are the ones whose pass rate is allowed to be quoted as production
// proof — CLAUDE.md section 15: "Do not present a tuned development-set
// score as production proof." Assigned deterministically by
// evals/cases.ts's assignSplits(), not authored per-case, so it stays
// consistent as the dataset grows.
export type EvalSplit = "dev" | "held_out";

export type EvalLineItemExpectation = {
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

export type EvalCase = {
  id: string;
  category: EvalCategory;
  title: string;
  documentLines: InvoiceDocumentLine[];
  split?: EvalSplit; // assigned by assignSplits(); absent until then
  expected: {
    outcome: DecisionOutcome;
    invoiceNumber?: string;
    total?: string;
    supplierMatch?: MatchTier;
    purchaseOrderMatch?: PoMatchTier;
    requiresReview?: boolean;
    injectionShouldBeFlagged?: boolean; // expects the source_screening control to fire a warning
    injectionShouldChangeOutcome?: boolean; // must always be false — asserts the defense actually held
    lineItems?: EvalLineItemExpectation[]; // per-line ground truth, for line-item extraction accuracy
    expectDuplicateCandidates?: boolean; // signal-level ground truth for duplicate precision/recall
  };
};
