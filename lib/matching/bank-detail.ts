import type { ControlResult, ExtractedInvoice } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"];

/**
 * Extracts "...ending 1234" style account/routing suffixes from a
 * remittance-details string. Our fixture and demo documents consistently
 * print "Acct ending XXXX" / "Routing ending XXXX" — this is a narrow,
 * deliberately simple parser scoped to that format, not a general bank-detail
 * OCR parser.
 */
function extractLast4(text: string, label: "Acct" | "Routing"): string | null {
  const match = text.match(new RegExp(`${label}\\s+ending\\s+(\\d{4})`, "i"));
  return match ? match[1] : null;
}

/**
 * Any difference between the invoice's printed remittance details and the
 * verified supplier master is treated as critical, regardless of amount or
 * how confidently the supplier's identity otherwise matches — CLAUDE.md
 * section 12. This function only ever compares; it never writes to the
 * supplier master.
 */
export function compareBankDetails(extracted: ExtractedInvoice, supplier: SupplierRow | null): ControlResult {
  const remittance = extracted.remittanceDetails;

  if (!supplier || !supplier.bank_name || !supplier.bank_account_last4 || !supplier.bank_routing_last4) {
    return {
      controlId: "bank_detail_change",
      label: "Remittance bank-detail comparison",
      status: "not_applicable",
      severity: "low",
      reason: "Supplier identity not confirmed, or no bank details on file — bank-detail comparison requires a known, on-file supplier master to compare against.",
      evidenceReferences: [],
      blocking: false,
    };
  }

  if (remittance == null || remittance.status !== "verified" || !remittance.value) {
    return {
      controlId: "bank_detail_change",
      label: "Remittance bank-detail comparison",
      status: "warning",
      severity: "medium",
      reason: "Invoice does not print a verifiable remittance block — nothing to compare against the supplier master.",
      evidenceReferences: ["remittanceDetails"],
      blocking: false,
    };
  }

  const invoiceAccountLast4 = extractLast4(remittance.value, "Acct");
  const invoiceRoutingLast4 = extractLast4(remittance.value, "Routing");

  const accountMatches = invoiceAccountLast4 !== null && invoiceAccountLast4 === supplier.bank_account_last4;
  const routingMatches = invoiceRoutingLast4 !== null && invoiceRoutingLast4 === supplier.bank_routing_last4;
  const bankNameMatches = remittance.value.toLowerCase().includes(supplier.bank_name.toLowerCase());

  if (accountMatches && routingMatches && bankNameMatches) {
    return {
      controlId: "bank_detail_change",
      label: "Remittance bank-detail comparison",
      status: "passed",
      severity: "low",
      reason: `Extracted remittance block (${supplier.bank_name}, acct ending ${supplier.bank_account_last4}) matches the approved supplier master exactly.`,
      evidenceReferences: ["remittanceDetails"],
      blocking: true,
    };
  }

  return {
    controlId: "bank_detail_change",
    label: "Remittance bank-detail comparison",
    status: "failed",
    severity: "critical",
    reason: `Invoice requests remittance to "${remittance.value}" — the approved supplier record on file has ${supplier.bank_name}, acct ending ${supplier.bank_account_last4}, routing ending ${supplier.bank_routing_last4}, verified ${supplier.bank_verified_at ?? "unknown date"}. Any difference is treated as critical regardless of supplier-identity match.`,
    evidenceReferences: ["remittanceDetails"],
    blocking: true,
  };
}
