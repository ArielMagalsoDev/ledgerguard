import type { ControlResult, ExtractedInvoice } from "@/lib/types";
import { addCents, centsDiff, centsToDecimalString, parseDecimalToCents } from "@/lib/money";

export type ArithmeticPolicy = {
  taxRoundingToleranceUsd: number;
};

/**
 * Recomputes every arithmetic relationship in the invoice using integer-cent
 * math — never trusting the printed figures. Produces the same 3 control
 * rows the Phase 1 fixtures hand-authored (arithmetic_line_totals,
 * arithmetic_subtotal, arithmetic_tax_total), now computed for real.
 *
 * A line whose quantity/unitPrice/lineTotal isn't independently verified
 * against the document (see align-evidence.ts) cannot be arithmetic-checked
 * at all — that's reported as its own failed, blocking control rather than
 * silently skipped, which is what actually enforces "no uncertain required
 * monetary field passes automatically."
 */
export function computeArithmeticControls(
  extracted: ExtractedInvoice,
  policy: ArithmeticPolicy
): ControlResult[] {
  const controls: ControlResult[] = [];
  const toleranceCents = Math.round(policy.taxRoundingToleranceUsd * 100);

  // --- Line-total recalculation ---
  const lineCents: (number | null)[] = [];
  const lineIssues: string[] = [];

  for (const li of extracted.lineItems) {
    const unresolved =
      li.quantity.status !== "verified" ||
      li.unitPrice.status !== "verified" ||
      li.lineTotal.status !== "verified";

    if (unresolved) {
      lineCents.push(null);
      lineIssues.push(
        `Line ${li.lineNumber} (${li.description.value ?? "unknown"}): quantity, unit price, or line total could not be independently verified against the document — cannot recompute.`
      );
      continue;
    }

    const qty = Number(li.quantity.value);
    const unitCents = parseDecimalToCents(li.unitPrice.value);
    const printedLineCents = parseDecimalToCents(li.lineTotal.value);

    if (!Number.isFinite(qty) || unitCents === null || printedLineCents === null) {
      lineCents.push(null);
      lineIssues.push(`Line ${li.lineNumber}: quantity, unit price, or line total is not a valid number.`);
      continue;
    }

    const computedLineCents = Math.round(qty * unitCents);
    lineCents.push(printedLineCents);

    if (centsDiff(computedLineCents, printedLineCents) > 1) {
      lineIssues.push(
        `Line ${li.lineNumber} (${li.description.value}): ${qty} × $${li.unitPrice.value} = $${centsToDecimalString(computedLineCents)}, but the printed line total is $${li.lineTotal.value}.`
      );
    }
  }

  controls.push({
    controlId: "arithmetic_line_totals",
    label: "Line-total recalculation",
    status: lineIssues.length === 0 ? "passed" : "failed",
    severity: lineIssues.length === 0 ? "low" : "high",
    reason:
      lineIssues.length === 0
        ? `All ${extracted.lineItems.length} line total(s) recompute exactly from quantity × unit price.`
        : lineIssues.join(" "),
    evidenceReferences: ["lineItems"],
    blocking: true,
  });

  // --- Subtotal recalculation ---
  const allLinesResolved = lineCents.every((c) => c !== null);
  const summedLineCents = allLinesResolved ? addCents(...(lineCents as number[])) : null;
  const printedSubtotalCents =
    extracted.subtotal.status === "verified" ? parseDecimalToCents(extracted.subtotal.value) : null;

  let subtotalStatus: ControlResult["status"] = "failed";
  let subtotalReason: string;
  if (!allLinesResolved) {
    subtotalReason = "Cannot recompute the subtotal — one or more line totals were not independently verified.";
  } else if (printedSubtotalCents === null) {
    subtotalReason = "Subtotal field is not a verified, valid monetary value — cannot check against line totals.";
  } else if (centsDiff(summedLineCents as number, printedSubtotalCents) <= 1) {
    subtotalStatus = "passed";
    subtotalReason = `Sum of line totals equals the printed subtotal of $${extracted.subtotal.value}.`;
  } else {
    subtotalReason = `Sum of line totals is $${centsToDecimalString(summedLineCents as number)}, but the printed subtotal is $${extracted.subtotal.value}.`;
  }

  controls.push({
    controlId: "arithmetic_subtotal",
    label: "Subtotal recalculation",
    status: subtotalStatus,
    severity: subtotalStatus === "passed" ? "low" : "high",
    reason: subtotalReason,
    evidenceReferences: ["subtotal"],
    blocking: true,
  });

  // --- Tax and grand-total recalculation ---
  const taxCents = extracted.tax.status === "verified" ? parseDecimalToCents(extracted.tax.value) : null;
  const totalCents = extracted.total.status === "verified" ? parseDecimalToCents(extracted.total.value) : null;

  let taxStatus: ControlResult["status"] = "failed";
  let taxReason: string;
  if (printedSubtotalCents === null || taxCents === null || totalCents === null) {
    taxReason = "Subtotal, tax, or total is not a verified, valid monetary value — cannot recompute.";
  } else {
    const computedTotalCents = addCents(printedSubtotalCents, taxCents);
    const diff = centsDiff(computedTotalCents, totalCents);
    if (diff <= toleranceCents) {
      taxStatus = "passed";
      taxReason =
        diff === 0
          ? `Subtotal + tax equals the printed total of $${extracted.total.value} exactly.`
          : `Subtotal + tax = $${centsToDecimalString(computedTotalCents)}; printed total is $${extracted.total.value} — $${centsToDecimalString(diff)} difference, within the $${policy.taxRoundingToleranceUsd.toFixed(2)} rounding tolerance.`;
    } else {
      taxReason = `Subtotal ($${extracted.subtotal.value}) + tax ($${extracted.tax.value}) = $${centsToDecimalString(computedTotalCents)}, but the printed total is $${extracted.total.value} — exceeds the $${policy.taxRoundingToleranceUsd.toFixed(2)} rounding tolerance.`;
    }
  }

  controls.push({
    controlId: "arithmetic_tax_total",
    label: "Tax and grand-total recalculation",
    status: taxStatus,
    severity: taxStatus === "passed" ? "low" : "high",
    reason: taxReason,
    evidenceReferences: ["tax", "total"],
    blocking: true,
  });

  return controls;
}
