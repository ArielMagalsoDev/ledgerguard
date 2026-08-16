"""Idempotent workflow intake. `submission_id` is the idempotency key: a
replayed submission returns the existing workflow's result and never
creates a second row or a second job — the unique constraint on
invoices.submission_id is the actual enforcement point, not this function's
control flow, so this is race-safe under concurrent calls."""

import secrets
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import write_audit_event
from ..models import Invoice, Job


@dataclass
class Submission:
    submission_id: str
    source: str  # email | upload | shared_folder | demo_scenario
    original_file_name: str
    file_hash: str
    mime_type: str
    received_at: datetime
    sender_email: str | None = None
    scenario_key: str | None = None
    session_token: str | None = None
    expires_at: datetime | None = None


@dataclass
class SubmitResult:
    invoice_id: str
    workflow_id: str
    status: str
    is_replay: bool


def _new_workflow_id() -> str:
    return f"wf_{secrets.token_hex(6)}"


def submit_invoice(db: Session, submission: Submission, storage_path: str) -> SubmitResult:
    workflow_id = _new_workflow_id()
    invoice = Invoice(
        submission_id=submission.submission_id,
        workflow_id=workflow_id,
        source=submission.source,
        original_file_name=submission.original_file_name,
        file_hash=submission.file_hash,
        mime_type=submission.mime_type,
        received_at=submission.received_at,
        sender_email=submission.sender_email,
        scenario_key=submission.scenario_key,
        session_token=submission.session_token,
        expires_at=submission.expires_at,
        storage_path=storage_path,
        status="received",
    )
    db.add(invoice)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Replay: the row already exists. Fetch it and log the attempt, but
        # never create a second job for it.
        existing = db.scalar(select(Invoice).where(Invoice.submission_id == submission.submission_id))
        if not existing:
            raise RuntimeError("submit_invoice: replay detected but could not load the existing row") from None

        write_audit_event(
            db,
            existing.id,
            "replay_detected",
            "Replayed submission",
            f"submissionId {submission.submission_id} was already processed — returned the existing "
            "workflow result without creating a new job.",
            "system",
        )
        return SubmitResult(
            invoice_id=str(existing.id), workflow_id=existing.workflow_id, status=existing.status, is_replay=True
        )

    # New submission: create the durable job and the intake audit event. If
    # either write fails here, the invoice row still exists and is safe to
    # retry — a stuck job can always be recreated for a known invoice id.
    db.add(Job(invoice_id=invoice.id, job_type="process_invoice", status="queued"))
    db.commit()

    write_audit_event(
        db,
        invoice.id,
        "submission_received",
        "Submission received",
        f"{submission.source} intake, submissionId {submission.submission_id}.",
        "system",
    )

    return SubmitResult(invoice_id=str(invoice.id), workflow_id=workflow_id, status=invoice.status, is_replay=False)
