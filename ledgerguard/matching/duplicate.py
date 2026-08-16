"""Exact duplicate-identity detection.

The 24 seeded historical invoices live in their own `ExistingInvoice`
table rather than mixed into the
live `invoices` table, so this checks both — a match against seed history
(e.g. the probable-duplicate scenario) or against a previously processed
live submission."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ExistingInvoice, Invoice


def check_duplicate(
    db: Session,
    extracted: dict,
    supplier_id: str | None,
    current_invoice_id,
    upload_scope_session_token: str | None = None,
) -> dict:
    """Exact supplier + normalized invoice number + date + total is a
    Duplicate Hold, full stop. File hash is checked separately at intake and
    is deliberately NOT the only signal here — a rescanned copy under a new
    filename has a different hash but the same identity, which is exactly
    the case this function exists to catch.

    Returns {"candidates": [...], "control": {...}}.
    """
    invoice_number = extracted["invoiceNumber"]
    invoice_date = extracted["invoiceDate"]
    total = extracted["total"]

    can_check_exact = (
        supplier_id
        and invoice_number.status == "verified"
        and invoice_number.normalized_value
        and invoice_date.status == "verified"
        and invoice_date.value
        and total.status == "verified"
        and total.value
    )

    if not can_check_exact:
        return {
            "candidates": [],
            "control": {
                "controlId": "duplicate_identity_check",
                "label": "Normalized duplicate-identity match",
                "status": "warning",
                "severity": "medium",
                "reason": "Supplier identity, invoice number, date, or total is not fully verified — duplicate identity cannot be checked with confidence.",
                "evidenceReferences": [],
                "blocking": False,
            },
        }

    total_value = float(total.value)
    try:
        invoice_date_value = date.fromisoformat(invoice_date.value)
    except ValueError:
        invoice_date_value = None

    matches: list[tuple[str, str, str]] = []  # (id, original_file_name, recorded_at_iso)

    existing_rows = (
        db.scalars(
            select(ExistingInvoice).where(
                ExistingInvoice.supplier_id == supplier_id,
                ExistingInvoice.invoice_number_normalized == invoice_number.normalized_value,
                ExistingInvoice.invoice_date == invoice_date_value,
                ExistingInvoice.total == total_value,
            )
        ).all()
        if invoice_date_value
        else []
    )
    for row in existing_rows:
        matches.append((row.id, row.original_file_name, row.recorded_at.isoformat()))

    live_query = select(Invoice).where(
        Invoice.supplier_id == supplier_id,
        Invoice.invoice_number_normalized == invoice_number.normalized_value,
        Invoice.invoice_date == invoice_date_value,
        Invoice.total == total_value,
        Invoice.id != current_invoice_id,
    )
    if upload_scope_session_token:
        live_query = live_query.where(
            (Invoice.source != "upload") | (Invoice.session_token == upload_scope_session_token)
        )
    live_rows = db.scalars(live_query).all() if invoice_date_value else []
    for row in live_rows:
        matches.append((str(row.id), row.original_file_name, row.created_at.isoformat()))

    matches.sort(key=lambda m: m[2])
    matches = matches[:5]

    if matches:
        first_id, first_filename, first_recorded = matches[0]
        candidates = [
            {
                "existingInvoiceId": m[0],
                "matchType": "exact",
                "matchedSignals": [
                    "supplier_id_exact",
                    "invoice_number_normalized_exact",
                    "invoice_date_exact",
                    "total_amount_exact",
                ],
            }
            for m in matches
        ]
        return {
            "candidates": candidates,
            "control": {
                "controlId": "duplicate_identity_check",
                "label": "Normalized duplicate-identity match",
                "status": "failed",
                "severity": "critical",
                "reason": (
                    f"Supplier, normalized invoice number ({invoice_number.value}), invoice date "
                    f"({invoice_date.value}), and total (${total.value}) all match invoice {first_id}, "
                    f'already recorded {first_recorded[:10]} as "{first_filename}".'
                ),
                "evidenceReferences": ["invoiceNumber", "invoiceDate", "total"],
                "blocking": True,
            },
        }

    return {
        "candidates": [],
        "control": {
            "controlId": "duplicate_identity_check",
            "label": "Normalized duplicate-identity match",
            "status": "passed",
            "severity": "low",
            "reason": "No matching supplier, invoice number, date, or amount found in invoice history.",
            "evidenceReferences": [],
            "blocking": True,
        },
    }
