"""Makes /demo show REAL pipeline output instead of only the static
fixtures/scenarios.py object. Finds the most recent processed invoice for a
given scenario key and overlays its real extraction/match/control/decision/
audit data onto the fixture. Curated presentational content that has no DB
equivalent — documentLines, narrative copy, title/tagline/order — always
comes from the fixture; only the pipeline's actual computed output is live.

If no live row exists yet for a scenario, this falls back to the fixture
entirely so the page never breaks — `is_live` tells the caller which
happened."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..fixtures.scenarios import SCENARIOS, get_scenario
from ..models import (
    AuditEvent,
    Control,
    Decision,
    ExistingInvoice,
    Invoice,
    MatchResult,
    PoLine,
    PurchaseOrder,
    Receipt,
    ReceiptLine,
    Supplier,
)


def lookup_duplicate_of(db: Session, existing_invoice_id: str):
    """A duplicate candidate's id may point at a seeded ExistingInvoice
    (string PK) or a live Invoice (UUID PK) — try both, string ids never
    parse as a UUID so the Invoice lookup is skipped rather than raising."""
    row = db.get(ExistingInvoice, existing_invoice_id)
    if row:
        return row
    try:
        return db.get(Invoice, uuid.UUID(existing_invoice_id))
    except ValueError:
        return None


def map_control(row: Control) -> dict:
    return {
        "controlId": row.control_id,
        "label": row.label,
        "status": row.status,
        "severity": row.severity,
        "reason": row.reason,
        "evidenceReferences": row.evidence_references or [],
        "blocking": row.blocking,
    }


def map_audit_event(row: AuditEvent) -> dict:
    return {
        "id": str(row.id),
        "timestamp": row.created_at.isoformat(),
        "stage": row.stage,
        "label": row.label,
        "detail": row.detail,
        "actor": row.actor,
        "latencyMs": row.latency_ms,
        "costUsd": row.cost_usd,
    }


def map_supplier(row: Supplier) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "taxId": row.tax_id,
        "approvedDomain": row.approved_domain or "",
        "status": row.status,
        "bankOnFile": {
            "bankName": row.bank_name or "",
            "accountLast4": row.bank_account_last4 or "",
            "routingLast4": row.bank_routing_last4 or "",
            "verifiedAt": row.bank_verified_at.isoformat() if row.bank_verified_at else "",
        },
    }


def fetch_purchase_order(db: Session, purchase_order_id: str) -> dict | None:
    po = db.get(PurchaseOrder, purchase_order_id)
    if not po:
        return None
    lines = db.scalars(select(PoLine).where(PoLine.purchase_order_id == po.id).order_by(PoLine.line_number)).all()
    return {
        "id": po.id,
        "number": po.po_number,
        "supplierId": po.supplier_id,
        "property": po.property_code,
        "currency": po.currency,
        "status": po.status,
        "issuedDate": po.issued_date.isoformat(),
        "notToExceed": str(po.not_to_exceed),
        "lines": [
            {"sku": l.sku, "description": l.description, "approvedQuantity": float(l.approved_quantity), "unitPrice": str(l.unit_price)}
            for l in lines
        ],
    }


def fetch_receipt(db: Session, receipt_id: str) -> dict | None:
    receipt = db.get(Receipt, receipt_id)
    if not receipt:
        return None
    lines = db.scalars(select(ReceiptLine).where(ReceiptLine.receipt_id == receipt.id)).all()
    return {
        "id": receipt.id,
        "purchaseOrderId": receipt.purchase_order_id,
        "receivedDate": receipt.received_date.isoformat(),
        "receivedBy": receipt.received_by,
        "lines": [{"sku": l.sku, "description": l.description, "quantityReceived": float(l.quantity_received)} for l in lines],
    }


def map_existing_invoice(row) -> dict:
    """`row` is either an ExistingInvoice (seed history) or a live Invoice —
    both carry the same identity fields a duplicate-of card needs."""
    if isinstance(row, ExistingInvoice):
        return {
            "id": row.id,
            "supplierId": row.supplier_id or "",
            "invoiceNumber": row.invoice_number or "",
            "invoiceDate": row.invoice_date.isoformat() if row.invoice_date else "",
            "total": str(row.total) if row.total is not None else "",
            "originalFileName": row.original_file_name,
            "recordedAt": row.recorded_at.isoformat(),
        }
    return {
        "id": str(row.id),
        "supplierId": row.supplier_id or "",
        "invoiceNumber": row.invoice_number or "",
        "invoiceDate": row.invoice_date.isoformat() if row.invoice_date else "",
        "total": str(row.total) if row.total is not None else "",
        "originalFileName": row.original_file_name,
        "recordedAt": row.created_at.isoformat(),
    }


def get_live_scenario(db: Session, scenario_key: str) -> dict:
    """Returns {"scenario": <dict shaped exactly like a fixtures/scenarios.py
    entry>, "is_live": bool}."""
    fixture = get_scenario(scenario_key)
    if not fixture:
        raise ValueError(f'Unknown scenario key "{scenario_key}"')

    invoice = db.scalar(
        select(Invoice).where(Invoice.scenario_key == scenario_key).order_by(Invoice.created_at.desc()).limit(1)
    )

    if not invoice or not invoice.extracted:
        return {"scenario": fixture, "is_live": False}

    control_rows = db.scalars(select(Control).where(Control.invoice_id == invoice.id)).all()
    match_row = db.scalar(select(MatchResult).where(MatchResult.invoice_id == invoice.id))
    decision_row = db.scalar(select(Decision).where(Decision.invoice_id == invoice.id))
    audit_rows = db.scalars(select(AuditEvent).where(AuditEvent.invoice_id == invoice.id).order_by(AuditEvent.created_at)).all()

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
    outcome = (decision_row.outcome if decision_row else None) or invoice.status or fixture["outcome"]

    match = (
        {
            "supplierId": match_row.supplier_id,
            "supplierMatch": match_row.supplier_match,
            "purchaseOrderId": match_row.purchase_order_id,
            "purchaseOrderMatch": match_row.purchase_order_match,
            "receiptIds": match_row.receipt_ids or [],
            "duplicateCandidates": duplicate_candidates,
        }
        if match_row
        else fixture["match"]
    )

    decision = (
        {
            "workflowId": decision_row.workflow_id,
            "outcome": outcome,
            "reason": decision_row.reason,
            "controls": controls,
            "approvalRoute": decision_row.approval_route or [],
            "proposedAccountingChange": decision_row.proposed_accounting_change,
            "requiredActions": decision_row.required_actions or [],
            "policyVersion": decision_row.policy_version,
        }
        if decision_row
        else fixture["decision"]
    )

    scenario = {
        **fixture,
        "outcome": outcome,
        "submission": {
            **fixture["submission"],
            "submissionId": invoice.submission_id,
            "receivedAt": invoice.received_at.isoformat(),
        },
        "extracted": invoice.extracted,
        "supplier": map_supplier(supplier_row) if supplier_row else fixture["supplier"],
        "purchaseOrder": purchase_order or fixture.get("purchaseOrder"),
        "receipt": receipt or fixture.get("receipt"),
        "duplicateOf": map_existing_invoice(duplicate_of_row) if duplicate_of_row else fixture.get("duplicateOf"),
        "match": match,
        "controls": controls if controls else fixture["controls"],
        "decision": decision,
        "auditEvents": [map_audit_event(a) for a in audit_rows] if audit_rows else fixture["auditEvents"],
    }

    return {"scenario": scenario, "is_live": True}


def get_all_live_scenarios(db: Session) -> list[dict]:
    return [get_live_scenario(db, s["id"]) for s in SCENARIOS]
