import { supabaseAdmin } from "@/lib/supabase/server";
import type { ControlResult, DuplicateCandidate, ExtractedInvoice } from "@/lib/types";

export type DuplicateCheckResult = {
  candidates: DuplicateCandidate[];
  control: ControlResult;
};

/**
 * Exact supplier + normalized invoice number + date + total is a Duplicate
 * Hold, full stop (CLAUDE.md section 12). File hash is checked separately at
 * intake and is deliberately NOT the only signal here — a rescanned copy
 * under a new filename has a different hash but the same identity, which is
 * exactly the case this function exists to catch.
 */
export async function checkDuplicate(
  db: ReturnType<typeof supabaseAdmin>,
  extracted: ExtractedInvoice,
  supplierId: string | null,
  currentInvoiceId: string
): Promise<DuplicateCheckResult> {
  const invoiceNumber = extracted.invoiceNumber;
  const invoiceDate = extracted.invoiceDate;
  const total = extracted.total;

  const canCheckExact =
    supplierId &&
    invoiceNumber.status === "verified" &&
    invoiceNumber.normalizedValue &&
    invoiceDate.status === "verified" &&
    invoiceDate.value &&
    total.status === "verified" &&
    total.value;

  if (!canCheckExact || !supplierId || !invoiceNumber.normalizedValue || !invoiceDate.value || !total.value) {
    return {
      candidates: [],
      control: {
        controlId: "duplicate_identity_check",
        label: "Normalized duplicate-identity match",
        status: "warning",
        severity: "medium",
        reason: "Supplier identity, invoice number, date, or total is not fully verified — duplicate identity cannot be checked with confidence.",
        evidenceReferences: [],
        blocking: false,
      },
    };
  }

  const { data: exactMatches } = await db
    .from("invoices")
    .select("id, submission_id, original_file_name, created_at")
    .eq("supplier_id", supplierId)
    .eq("invoice_number_normalized", invoiceNumber.normalizedValue)
    .eq("invoice_date", invoiceDate.value)
    .eq("total", Number(total.value))
    .neq("id", currentInvoiceId)
    .order("created_at", { ascending: true })
    .limit(5);

  if (exactMatches && exactMatches.length > 0) {
    const first = exactMatches[0];
    const candidates: DuplicateCandidate[] = exactMatches.map((m) => ({
      existingInvoiceId: m.id,
      matchType: "exact",
      matchedSignals: ["supplier_id_exact", "invoice_number_normalized_exact", "invoice_date_exact", "total_amount_exact"],
    }));

    return {
      candidates,
      control: {
        controlId: "duplicate_identity_check",
        label: "Normalized duplicate-identity match",
        status: "failed",
        severity: "critical",
        reason: `Supplier, normalized invoice number (${invoiceNumber.value}), invoice date (${invoiceDate.value}), and total ($${total.value}) all match invoice ${first.id}, already recorded ${first.created_at.slice(0, 10)} as "${first.original_file_name}".`,
        evidenceReferences: ["invoiceNumber", "invoiceDate", "total"],
        blocking: true,
      },
    };
  }

  return {
    candidates: [],
    control: {
      controlId: "duplicate_identity_check",
      label: "Normalized duplicate-identity match",
      status: "passed",
      severity: "low",
      reason: "No matching supplier, invoice number, date, or amount found in invoice history.",
      evidenceReferences: [],
      blocking: true,
    },
  };
}
