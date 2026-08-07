import type { ExtractedField, ExtractedInvoice } from "@/lib/types";

const REQUIRED_HEADER_FIELDS: (keyof ExtractedInvoice)[] = [
  "invoiceNumber",
  "invoiceDate",
  "supplierName",
  "supplierTaxId",
  "currency",
  "subtotal",
  "tax",
  "total",
];

const REQUIRED_LINE_FIELDS = ["description", "quantity", "unitPrice", "lineTotal"] as const;

export type ValidationResult = {
  requiresReview: boolean;
  problemFields: string[];
};

/**
 * The enforcement point for CLAUDE.md section 3's Phase 3 acceptance
 * criterion: "no uncertain required monetary field passes automatically."
 * Any required field that isn't "verified" — uncertain, missing, or
 * conflicting — flags the whole extraction for review. This is a pure
 * function over already-aligned data; it never itself decides an outcome,
 * it only refuses to certify one as clean.
 */
export function validateRequiredFields(extracted: ExtractedInvoice): ValidationResult {
  const problemFields: string[] = [];

  for (const key of REQUIRED_HEADER_FIELDS) {
    const field = extracted[key] as ExtractedField<string> | undefined;
    if (field && field.status !== "verified") {
      problemFields.push(key);
    }
  }

  for (const line of extracted.lineItems) {
    for (const sub of REQUIRED_LINE_FIELDS) {
      if (line[sub].status !== "verified") {
        problemFields.push(`lineItems[${line.lineNumber}].${sub}`);
      }
    }
  }

  return { requiresReview: problemFields.length > 0, problemFields };
}
