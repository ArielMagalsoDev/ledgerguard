"""Assembles a scenario-shaped object for an arbitrary uploaded invoice, the
same shape queue_.live_scenario builds for the five seeded scenarios, so
the existing result panels render it unmodified. Unlike get_live_scenario,
there's no fixture to fall back to or overlay onto: every field here comes
from the live DB row."""

import re
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AuditEvent, Control, Decision, Invoice, MatchResult, Supplier, ensure_aware
from ..queue_.live_scenario import (
    fetch_purchase_order,
    fetch_receipt,
    lookup_duplicate_of,
    map_audit_event,
    map_control,
    map_existing_invoice,
    map_supplier,
)

# Masks full bank account/routing numbers before they ever reach the
# browser. The seeded demo fixtures only ever print "...ending 1234"-style
# values by construction, so this doesn't apply there — but an arbitrary
# uploaded invoice is real third-party content that may print full digit
# runs verbatim, in both the extracted value and its source quote.
_DIGIT_RUN = re.compile(r"\d{5,}")


def _redact_digit_runs(text: str) -> str:
    def repl(m: re.Match) -> str:
        run = m.group(0)
        return "•" * max(0, len(run) - 4) + run[-4:]

    return _DIGIT_RUN.sub(repl, text)


def _redact_remittance_field(field: dict | None) -> dict | None:
    if not field:
        return field
    redacted = dict(field)
    if redacted.get("value"):
        redacted["value"] = _redact_digit_runs(redacted["value"])
    if redacted.get("normalizedValue"):
        redacted["normalizedValue"] = _redact_digit_runs(redacted["normalizedValue"])
    redacted["evidence"] = [{**e, "text": _redact_digit_runs(e["text"])} for e in redacted.get("evidence", [])]
    return redacted


# Rendered when supplier tier is "none" — the common, honest case for an
# arbitrary uploaded document. Every field reads as visibly absent rather
# than silently blank.
UNMATCHED_SUPPLIER = {
    "id": "unmatched",
    "name": "Not matched to an approved supplier",
    "taxId": "—",
    "approvedDomain": "",
    "status": "pending",
    "bankOnFile": {"bankName": "", "accountLast4": "", "routingLast4": "", "verifiedAt": ""},
}


def get_upload_scenario(db: Session, invoice_id, session_token: str) -> dict:
    """Loads one upload invoice by id, scoped to the owning session token so
    a visitor can never fetch another visitor's result by guessing an id.
    Returns {"state": "not_found" | "expired" | "processing" | "ready", ...}
    — "not found", "expired", "still processing" are all expected UI
    states, not error conditions."""
    invoice = db.scalar(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.source == "upload", Invoice.session_token == session_token)
    )

    if not invoice:
        return {"state": "not_found"}
    if invoice.expires_at and ensure_aware(invoice.expires_at) < datetime.now(UTC):
        return {"state": "expired"}

    control_rows = db.scalars(select(Control).where(Control.invoice_id == invoice.id)).all()
    match_row = db.scalar(select(MatchResult).where(MatchResult.invoice_id == invoice.id))
    decision_row = db.scalar(select(Decision).where(Decision.invoice_id == invoice.id))
    audit_rows = db.scalars(select(AuditEvent).where(AuditEvent.invoice_id == invoice.id).order_by(AuditEvent.created_at)).all()

    if not decision_row or not invoice.extracted:
        return {"state": "processing"}

    supplier_id = invoice.supplier_id or (match_row.supplier_id if match_row else None)
    purchase_order_id = invoice.purchase_order_id or (match_row.purchase_order_id if match_row else None)
    first_receipt_id = (match_row.receipt_ids or [None])[0] if match_row else None
    duplicate_candidates = match_row.duplicate_candidates or [] if match_row else []
    first_duplicate_id = duplicate_candidates[0]["existingInvoiceId"] if duplicate_candidates else None

    supplier_row = db.get(Supplier, supplier_id) if supplier_id else None
    purchase_order = fetch_purchase_order(db, purchase_order_id) if purchase_order_id else None
    receipt = fetch_receipt(db, first_receipt_id) if first_receipt_id else None
    duplicate_of_row = lookup_duplicate_of(db, first_duplicate_id) if first_duplicate_id else None

    controls = [map_control(c) for c in control_rows]
    outcome = decision_row.outcome
    extracted = dict(invoice.extracted)
    extracted["remittanceDetails"] = _redact_remittance_field(extracted.get("remittanceDetails"))

    match = {
        "supplierId": match_row.supplier_id if match_row else None,
        "supplierMatch": (match_row.supplier_match if match_row else None) or "none",
        "purchaseOrderId": match_row.purchase_order_id if match_row else None,
        "purchaseOrderMatch": (match_row.purchase_order_match if match_row else None) or "none",
        "receiptIds": match_row.receipt_ids or [] if match_row else [],
        "duplicateCandidates": duplicate_candidates,
    }

    decision = {
        "workflowId": decision_row.workflow_id,
        "outcome": outcome,
        "reason": decision_row.reason,
        "controls": controls,
        "approvalRoute": decision_row.approval_route or [],
        "proposedAccountingChange": decision_row.proposed_accounting_change,
        "requiredActions": decision_row.required_actions or [],
        "policyVersion": decision_row.policy_version,
    }

    display_name = (extracted.get("supplierName") or {}).get("value") or invoice.original_file_name
    invoice_number_value = (extracted.get("invoiceNumber") or {}).get("value")

    scenario = {
        "id": f"upload:{invoice.id}",
        "order": 0,
        "outcome": outcome,
        "title": display_name,
        "shortLabel": "Your upload",
        "tagline": f"Invoice {invoice_number_value}" if invoice_number_value else invoice.original_file_name,
        "submission": {
            "submissionId": invoice.submission_id,
            "source": "upload",
            "originalFileName": invoice.original_file_name,
            "fileHash": invoice.file_hash,
            "mimeType": "application/pdf",
            "receivedAt": invoice.received_at.isoformat(),
        },
        "documentLines": [],  # the real uploaded PDF is rendered directly, not from curated fixture lines
        "extracted": extracted,
        "supplier": map_supplier(supplier_row) if supplier_row else UNMATCHED_SUPPLIER,
        "purchaseOrder": purchase_order,
        "receipt": receipt,
        "duplicateOf": map_existing_invoice(duplicate_of_row) if duplicate_of_row else None,
        "match": match,
        "controls": controls,
        "decision": decision,
        "auditEvents": [map_audit_event(a) for a in audit_rows],
        "narrative": {
            "whatHappened": decision["reason"],
            "whyItMatters": (
                "This is your own document, run through the same real extraction, evidence-alignment, and "
                "control pipeline as the five seeded scenarios — under the upload sandbox's policy, which "
                "never auto-approves an uploaded document and treats an unrecognized supplier as an honest "
                "exception rather than a fabricated match."
            ),
        },
    }

    return {
        "state": "ready",
        "scenario": scenario,
        "expiresAt": invoice.expires_at.isoformat() if invoice.expires_at else "",
        "originalFileName": invoice.original_file_name,
        "storagePath": invoice.storage_path,
    }
