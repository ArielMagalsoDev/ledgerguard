import { supabaseAdmin } from "@/lib/supabase/server";
import type { ControlResult, ExtractedInvoice, PoMatchTier } from "@/lib/types";
import { matchReceipts } from "@/lib/matching/receipt";
import { parseDecimalToCents, centsToDecimalString } from "@/lib/money";
import type { PolicyConfig } from "@/lib/matching/policy";

export type PurchaseOrderMatchResult = {
  purchaseOrderId: string | null;
  tier: PoMatchTier;
  receiptIds: string[];
  controls: ControlResult[];
};

function normalizeDescription(s: string): string {
  return s.toLowerCase().trim();
}

function linesMatch(a: string, b: string): boolean {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function allowedCentsDiff(baseCents: number, policy: PolicyConfig["unitPriceTolerance"]): number {
  return Math.min(Math.round(baseCents * policy.pct), Math.round(policy.flat * 100));
}

/**
 * PO header + line-item matching, receipt matching, and tolerance
 * evaluation in one pass — CLAUDE.md section 12. No PO number on the
 * invoice is a permitted non-PO category (tier "none", no controls raised);
 * a PO number that doesn't resolve to a real record is a real problem, not
 * a graceful fallback.
 */
export async function matchPurchaseOrder(
  db: ReturnType<typeof supabaseAdmin>,
  extracted: ExtractedInvoice,
  supplierId: string | null,
  policy: PolicyConfig
): Promise<PurchaseOrderMatchResult> {
  const poNumberField = extracted.purchaseOrderNumber;

  if (poNumberField.status !== "verified" || !poNumberField.value) {
    return { purchaseOrderId: null, tier: "none", receiptIds: [], controls: [] };
  }

  const { data: po } = await db.from("purchase_orders").select("*").eq("po_number", poNumberField.value).maybeSingle();

  if (!po) {
    return {
      purchaseOrderId: null,
      tier: "none",
      receiptIds: [],
      controls: [
        {
          controlId: "po_not_found",
          label: "Purchase-order lookup",
          status: "failed",
          severity: "critical",
          reason: `PO number "${poNumberField.value}" was extracted from the invoice, but no matching purchase order exists on file.`,
          evidenceReferences: ["purchaseOrderNumber"],
          blocking: true,
        },
      ],
    };
  }

  const controls: ControlResult[] = [];

  controls.push({
    controlId: "po_status",
    label: "Purchase-order status",
    status: po.status === "open" ? "passed" : "failed",
    severity: po.status === "open" ? "low" : "critical",
    reason:
      po.status === "open"
        ? `${po.po_number} is open.`
        : `${po.po_number} is ${po.status}, not open — closed or cancelled purchase orders block automatic routing.`,
    evidenceReferences: ["purchaseOrderNumber"],
    blocking: true,
  });

  if (supplierId && po.supplier_id !== supplierId) {
    controls.push({
      controlId: "po_supplier_mismatch",
      label: "PO-to-supplier match",
      status: "failed",
      severity: "critical",
      reason: `${po.po_number} is issued to a different supplier than the one matched on this invoice.`,
      evidenceReferences: ["purchaseOrderNumber", "supplierTaxId"],
      blocking: true,
    });
  }

  const { data: poLines } = await db.from("po_lines").select("*").eq("purchase_order_id", po.id).order("line_number");
  const { receiptIds, receivedQuantityByDescription } = await matchReceipts(db, po.id);

  const claimed = new Set<string>();
  const cleanMatches: string[] = [];
  const unmatchedLines: string[] = [];

  for (const line of extracted.lineItems) {
    if (line.description.status !== "verified" || !line.description.value) {
      unmatchedLines.push(`Line ${line.lineNumber}: description not independently verified against the document.`);
      continue;
    }

    const candidate = (poLines ?? []).find((pl) => !claimed.has(pl.id) && linesMatch(line.description.value as string, pl.description));

    if (!candidate) {
      const invoiceTotal = extracted.total.status === "verified" ? parseDecimalToCents(extracted.total.value) : null;
      const notToExceedCents = parseDecimalToCents(String(po.not_to_exceed));
      let overageNote = "";
      if (invoiceTotal !== null && notToExceedCents !== null && invoiceTotal > notToExceedCents) {
        const overageCents = invoiceTotal - notToExceedCents;
        const overagePct = ((overageCents / notToExceedCents) * 100).toFixed(1);
        overageNote = ` This pushes the invoice $${centsToDecimalString(overageCents)} (${overagePct}%) over the PO's not-to-exceed amount of $${po.not_to_exceed}, beyond the lower-of-${(policy.totalInvoiceTolerance.pct * 100).toFixed(0)}%/$${policy.totalInvoiceTolerance.flat} total tolerance.`;
      }
      unmatchedLines.push(
        `"${line.description.value}" ($${line.lineTotal.value ?? "unknown"}) is not on ${po.po_number} and has no receipt or separate authorization.${overageNote}`
      );
      continue;
    }

    claimed.add(candidate.id);

    const lineIssues: string[] = [];

    if (line.unitPrice.status === "verified" && line.unitPrice.value) {
      const invoiceCents = parseDecimalToCents(line.unitPrice.value);
      const poCents = parseDecimalToCents(String(candidate.unit_price));
      if (invoiceCents !== null && poCents !== null) {
        const diff = Math.abs(invoiceCents - poCents);
        const allowed = allowedCentsDiff(poCents, policy.unitPriceTolerance);
        if (diff > allowed) {
          controls.push({
            controlId: "po_unit_price_tolerance",
            label: `Unit-price tolerance — ${candidate.description}`,
            status: "failed",
            severity: "high",
            reason: `Invoiced $${line.unitPrice.value} vs. ${po.po_number} approved $${candidate.unit_price} — $${centsToDecimalString(diff)} over, exceeding the lower-of-${(policy.unitPriceTolerance.pct * 100).toFixed(0)}%/$${policy.unitPriceTolerance.flat} tolerance ($${centsToDecimalString(allowed)} max allowed).`,
            evidenceReferences: ["purchaseOrderNumber"],
            blocking: true,
          });
          lineIssues.push("price");
        }
      }
    }

    if (line.quantity.status === "verified" && line.quantity.value) {
      const invoiceQty = Number(line.quantity.value);
      if (Number.isFinite(invoiceQty) && invoiceQty > candidate.approved_quantity) {
        const receivedQty = receivedQuantityByDescription.get(normalizeDescription(candidate.description)) ?? 0;
        const excessCovered = policy.quantityTolerance.requiresReceiptForExcess ? receivedQty >= invoiceQty : true;
        if (!excessCovered) {
          controls.push({
            controlId: "po_quantity_tolerance",
            label: `Quantity tolerance — ${candidate.description}`,
            status: "failed",
            severity: "high",
            reason: `Invoiced ${invoiceQty} vs. ${po.po_number} approved maximum ${candidate.approved_quantity} — ${invoiceQty - candidate.approved_quantity} over, with no receipt recording the additional quantity. Quantity tolerance is zero without receipt evidence.`,
            evidenceReferences: ["purchaseOrderNumber"],
            blocking: true,
          });
          lineIssues.push("quantity");
        }
      }
    }

    if (lineIssues.length === 0) {
      cleanMatches.push(candidate.description);
    }
  }

  if (cleanMatches.length > 0) {
    controls.push({
      controlId: "po_line_match",
      label: "Matched PO line(s)",
      status: "passed",
      severity: "low",
      reason: `${cleanMatches.length} line(s) match ${po.po_number} within tolerance: ${cleanMatches.join(", ")}.`,
      evidenceReferences: ["purchaseOrderNumber"],
      blocking: false,
    });
  }

  for (const note of unmatchedLines) {
    controls.push({
      controlId: "po_unmatched_line",
      label: "Unmatched invoice line",
      status: "failed",
      severity: "high",
      reason: note,
      evidenceReferences: ["purchaseOrderNumber"],
      blocking: true,
    });
  }

  const hasProblems = controls.some((c) => c.status === "failed" && c.controlId !== "po_status") || unmatchedLines.length > 0;
  let tier: PoMatchTier;
  if (unmatchedLines.length === extracted.lineItems.length) {
    tier = "ambiguous";
  } else if (!hasProblems) {
    tier = "exact";
  } else {
    tier = "partial";
  }

  return { purchaseOrderId: po.id, tier, receiptIds, controls };
}
