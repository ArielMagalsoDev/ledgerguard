import type { DecisionOutcome, InvoiceDocumentLine, MatchTier, PoMatchTier } from "@/lib/types";

export type EvalCategory =
  | "clean_match"
  | "price_quantity_exception"
  | "arithmetic_tax_failure"
  | "duplicate"
  | "supplier_bank_detail"
  | "ambiguous_scan"
  | "adversarial_injection";

export type EvalCase = {
  id: string;
  category: EvalCategory;
  title: string;
  documentLines: InvoiceDocumentLine[];
  expected: {
    outcome: DecisionOutcome;
    invoiceNumber?: string;
    total?: string;
    supplierMatch?: MatchTier;
    purchaseOrderMatch?: PoMatchTier;
    requiresReview?: boolean;
    injectionShouldBeFlagged?: boolean; // expects the source_screening control to fire a warning
    injectionShouldChangeOutcome?: boolean; // must always be false — asserts the defense actually held
  };
};
