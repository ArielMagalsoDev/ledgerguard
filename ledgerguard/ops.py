"""Live operating snapshot for /operations — real aggregates over invoices
the pipeline has actually processed, not a fixture total."""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import AccountingBill, AuditEvent, Control, Decision, Invoice, Job, ReviewAction, ensure_aware

DECIDED_STATUSES = ("ready_for_approval", "exception_review", "duplicate_hold", "blocked")


def get_operations_summary(db: Session) -> dict:
    total_invoices = db.scalar(select(func.count()).select_from(Invoice)) or 0

    decided_invoices = db.scalars(select(Invoice).where(Invoice.status.in_(DECIDED_STATUSES))).all()
    decided_ids = [i.id for i in decided_invoices]

    total_audit_events = db.scalar(select(func.count()).select_from(AuditEvent)) or 0

    latency_cost_rows = db.execute(
        select(func.coalesce(func.sum(AuditEvent.latency_ms), 0), func.coalesce(func.sum(AuditEvent.cost_usd), 0.0))
    ).one()
    total_latency_ms, total_cost_usd = latency_cost_rows

    status_counts: dict[str, int] = {}
    for inv in db.scalars(select(Invoice)).all():
        status_counts[inv.status] = status_counts.get(inv.status, 0) + 1
    invoices_by_status = [{"status": k, "count": v} for k, v in sorted(status_counts.items())]

    decisions = db.scalars(select(Decision).where(Decision.invoice_id.in_(decided_ids))).all() if decided_ids else []
    duplicate_holds_confirmed = sum(1 for d in decisions if d.outcome == "duplicate_hold")

    controls = db.scalars(select(Control).where(Control.invoice_id.in_(decided_ids))).all() if decided_ids else []
    duplicate_candidate_invoice_ids = {
        c.invoice_id for c in controls if c.control_id == "duplicate_identity_check" and c.status != "passed"
    }

    corrected_invoice_ids = {
        e.invoice_id for e in db.scalars(select(AuditEvent).where(AuditEvent.stage == "field_corrected")).all()
    }
    human_correction_rate = (
        len([i for i in decided_ids if i in corrected_invoice_ids]) / len(decided_ids) if decided_ids else 0.0
    )

    now = datetime.now(UTC)
    approval_backlog = []
    for inv in decided_invoices:
        if inv.status not in ("exception_review", "blocked"):
            continue
        latest_action = db.scalar(
            select(ReviewAction).where(ReviewAction.invoice_id == inv.id).order_by(ReviewAction.created_at.desc()).limit(1)
        )
        if latest_action and latest_action.action in ("approved", "rejected"):
            continue
        age_hours = (now - ensure_aware(inv.created_at)).total_seconds() / 3600
        approval_backlog.append({"invoiceId": str(inv.id), "invoiceNumber": inv.invoice_number, "outcome": inv.status, "ageHours": age_hours})
    approval_backlog.sort(key=lambda b: b["ageHours"], reverse=True)

    exceptions_by_control: dict[str, dict] = {}
    for c in controls:
        if c.status not in ("failed", "warning"):
            continue
        entry = exceptions_by_control.setdefault(c.control_id, {"controlId": c.control_id, "label": c.label, "count": 0})
        entry["count"] += 1
    exceptions_by_control_list = sorted(exceptions_by_control.values(), key=lambda e: e["count"], reverse=True)

    accounting_created = db.scalar(select(func.count()).select_from(AccountingBill)) or 0

    jobs = db.scalars(select(Job)).all()
    job_failures = {
        "transient": sum(1 for j in jobs if j.status == "failed_transient"),
        "permanent": sum(1 for j in jobs if j.status == "failed_permanent"),
    }

    per_invoice = []
    for inv in decided_invoices:
        events = db.scalars(select(AuditEvent).where(AuditEvent.invoice_id == inv.id)).all()
        per_invoice.append(
            {
                "invoiceId": str(inv.id),
                "workflowId": inv.workflow_id,
                "invoiceNumber": inv.invoice_number,
                "outcome": inv.status,
                "events": len(events),
                "latencyMs": sum(e.latency_ms or 0 for e in events),
                "costUsd": sum(e.cost_usd or 0 for e in events),
            }
        )
    per_invoice.sort(key=lambda s: s["invoiceId"], reverse=True)

    return {
        "totalInvoices": total_invoices,
        "decidedInvoices": len(decided_invoices),
        "totalAuditEvents": total_audit_events,
        "totalLatencyMs": total_latency_ms,
        "totalCostUsd": float(total_cost_usd),
        "invoicesByStatus": invoices_by_status,
        "duplicateHoldsConfirmed": duplicate_holds_confirmed,
        "duplicateCandidatesFound": len(duplicate_candidate_invoice_ids),
        "humanCorrectionRate": human_correction_rate,
        "approvalBacklog": approval_backlog,
        "exceptionsByControl": exceptions_by_control_list,
        "accountingCreated": accounting_created,
        "accountingFailures": 0,
        "jobFailures": job_failures,
        "perInvoice": per_invoice,
    }
