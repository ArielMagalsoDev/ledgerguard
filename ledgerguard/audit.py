"""Append-only audit trail — one event per pipeline stage, written as soon
as the stage's outcome is known."""

from sqlalchemy.orm import Session

from .models import AuditEvent


def write_audit_event(
    db: Session,
    invoice_id,
    stage: str,
    label: str,
    detail: str,
    actor: str,
    latency_ms: int | None = None,
    cost_usd: float | None = None,
) -> None:
    db.add(
        AuditEvent(
            invoice_id=invoice_id,
            stage=stage,
            label=label,
            detail=detail,
            actor=actor,
            latency_ms=latency_ms,
            cost_usd=cost_usd,
        )
    )
    db.commit()
