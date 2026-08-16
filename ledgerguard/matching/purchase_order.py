"""PO header + line-item matching, receipt matching, and tolerance
evaluation in one pass."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PoLine, PurchaseOrder
from ..money import cents_to_decimal_string, parse_decimal_to_cents
from ..policy import PolicyConfig
from .receipt import match_receipts


def _normalize_description(s: str) -> str:
    return s.lower().strip()


def _lines_match(a: str, b: str) -> bool:
    na, nb = _normalize_description(a), _normalize_description(b)
    return na == nb or nb in na or na in nb


def _allowed_cents_diff(base_cents: int, tolerance) -> int:
    return min(round(base_cents * tolerance.pct), round(tolerance.flat * 100))


def match_purchase_order(db: Session, extracted: dict, supplier_id: str | None, policy: PolicyConfig) -> dict:
    """No PO number on the invoice is a permitted non-PO category (tier
    "none", no controls raised); a PO number that doesn't resolve to a real
    record is a real problem, not a graceful fallback.

    Returns {"purchase_order_id", "tier", "receipt_ids", "controls"}.
    """
    po_number_field = extracted["purchaseOrderNumber"]

    if po_number_field.status != "verified" or not po_number_field.value:
        return {"purchase_order_id": None, "tier": "none", "receipt_ids": [], "controls": []}

    po = db.scalar(select(PurchaseOrder).where(PurchaseOrder.po_number == po_number_field.value))

    if not po:
        return {
            "purchase_order_id": None,
            "tier": "none",
            "receipt_ids": [],
            "controls": [
                {
                    "controlId": "po_not_found",
                    "label": "Purchase-order lookup",
                    "status": "failed",
                    "severity": "critical",
                    "reason": f'PO number "{po_number_field.value}" was extracted from the invoice, but no matching purchase order exists on file.',
                    "evidenceReferences": ["purchaseOrderNumber"],
                    "blocking": True,
                }
            ],
        }

    controls: list[dict] = []

    controls.append(
        {
            "controlId": "po_status",
            "label": "Purchase-order status",
            "status": "passed" if po.status == "open" else "failed",
            "severity": "low" if po.status == "open" else "critical",
            "reason": (
                f"{po.po_number} is open."
                if po.status == "open"
                else f"{po.po_number} is {po.status}, not open — closed or cancelled purchase orders block automatic routing."
            ),
            "evidenceReferences": ["purchaseOrderNumber"],
            "blocking": True,
        }
    )

    if supplier_id and po.supplier_id != supplier_id:
        controls.append(
            {
                "controlId": "po_supplier_mismatch",
                "label": "PO-to-supplier match",
                "status": "failed",
                "severity": "critical",
                "reason": f"{po.po_number} is issued to a different supplier than the one matched on this invoice.",
                "evidenceReferences": ["purchaseOrderNumber", "supplierTaxId"],
                "blocking": True,
            }
        )

    po_lines = db.scalars(select(PoLine).where(PoLine.purchase_order_id == po.id).order_by(PoLine.line_number)).all()
    receipt_match = match_receipts(db, po.id)
    received_by_desc = receipt_match["received_quantity_by_description"]

    claimed: set = set()
    clean_matches: list[str] = []
    unmatched_lines: list[str] = []

    for line in extracted["lineItems"]:
        if line["description"].status != "verified" or not line["description"].value:
            unmatched_lines.append(f"Line {line['lineNumber']}: description not independently verified against the document.")
            continue

        candidate = next(
            (pl for pl in po_lines if pl.id not in claimed and _lines_match(line["description"].value, pl.description)),
            None,
        )

        if not candidate:
            invoice_total = parse_decimal_to_cents(extracted["total"].value) if extracted["total"].status == "verified" else None
            not_to_exceed_cents = parse_decimal_to_cents(str(po.not_to_exceed))
            overage_note = ""
            if invoice_total is not None and not_to_exceed_cents is not None and invoice_total > not_to_exceed_cents:
                overage_cents = invoice_total - not_to_exceed_cents
                overage_pct = round((overage_cents / not_to_exceed_cents) * 100, 1)
                overage_note = (
                    f" This pushes the invoice ${cents_to_decimal_string(overage_cents)} ({overage_pct}%) over "
                    f"the PO's not-to-exceed amount of ${po.not_to_exceed}, beyond the "
                    f"lower-of-{round(policy.total_invoice_tolerance.pct * 100)}%/${policy.total_invoice_tolerance.flat:g} total tolerance."
                )
            line_total_value = line["lineTotal"].value or "unknown"
            unmatched_lines.append(
                f"\"{line['description'].value}\" (${line_total_value}) is not on {po.po_number} and has no "
                f"receipt or separate authorization.{overage_note}"
            )
            continue

        claimed.add(candidate.id)
        line_issues: list[str] = []

        if line["unitPrice"].status == "verified" and line["unitPrice"].value:
            invoice_cents = parse_decimal_to_cents(line["unitPrice"].value)
            po_cents = parse_decimal_to_cents(str(candidate.unit_price))
            if invoice_cents is not None and po_cents is not None:
                diff = abs(invoice_cents - po_cents)
                allowed = _allowed_cents_diff(po_cents, policy.unit_price_tolerance)
                if diff > allowed:
                    controls.append(
                        {
                            "controlId": "po_unit_price_tolerance",
                            "label": f"Unit-price tolerance — {candidate.description}",
                            "status": "failed",
                            "severity": "high",
                            "reason": (
                                f"Invoiced ${line['unitPrice'].value} vs. {po.po_number} approved "
                                f"${candidate.unit_price} — ${cents_to_decimal_string(diff)} over, exceeding "
                                f"the lower-of-{round(policy.unit_price_tolerance.pct * 100)}%/"
                                f"${policy.unit_price_tolerance.flat:g} tolerance "
                                f"(${cents_to_decimal_string(allowed)} max allowed)."
                            ),
                            "evidenceReferences": ["purchaseOrderNumber"],
                            "blocking": True,
                        }
                    )
                    line_issues.append("price")

        if line["quantity"].status == "verified" and line["quantity"].value:
            try:
                invoice_qty = float(line["quantity"].value)
            except ValueError:
                invoice_qty = None
            if invoice_qty is not None and invoice_qty > float(candidate.approved_quantity):
                received_qty = received_by_desc.get(_normalize_description(candidate.description), 0)
                excess_covered = received_qty >= invoice_qty if policy.quantity_tolerance.requires_receipt_for_excess else True
                if not excess_covered:
                    controls.append(
                        {
                            "controlId": "po_quantity_tolerance",
                            "label": f"Quantity tolerance — {candidate.description}",
                            "status": "failed",
                            "severity": "high",
                            "reason": (
                                f"Invoiced {invoice_qty:g} vs. {po.po_number} approved maximum "
                                f"{float(candidate.approved_quantity):g} — {invoice_qty - float(candidate.approved_quantity):g} "
                                "over, with no receipt recording the additional quantity. Quantity tolerance "
                                "is zero without receipt evidence."
                            ),
                            "evidenceReferences": ["purchaseOrderNumber"],
                            "blocking": True,
                        }
                    )
                    line_issues.append("quantity")

        if not line_issues:
            clean_matches.append(candidate.description)

    if clean_matches:
        controls.append(
            {
                "controlId": "po_line_match",
                "label": "Matched PO line(s)",
                "status": "passed",
                "severity": "low",
                "reason": f"{len(clean_matches)} line(s) match {po.po_number} within tolerance: {', '.join(clean_matches)}.",
                "evidenceReferences": ["purchaseOrderNumber"],
                "blocking": False,
            }
        )

    for note in unmatched_lines:
        controls.append(
            {
                "controlId": "po_unmatched_line",
                "label": "Unmatched invoice line",
                "status": "failed",
                "severity": "high",
                "reason": note,
                "evidenceReferences": ["purchaseOrderNumber"],
                "blocking": True,
            }
        )

    has_problems = any(c["status"] == "failed" and c["controlId"] != "po_status" for c in controls) or bool(unmatched_lines)
    if len(unmatched_lines) == len(extracted["lineItems"]):
        tier = "ambiguous"
    elif not has_problems:
        tier = "exact"
    else:
        tier = "partial"

    return {"purchase_order_id": po.id, "tier": tier, "receipt_ids": receipt_match["receipt_ids"], "controls": controls}
