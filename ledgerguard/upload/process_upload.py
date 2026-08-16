"""Upload sandbox — the actual intake + processing sequence a POST
/api/upload request runs: validate → hash → store → idempotent intake →
drain the job queue until *this* invoice's decision exists."""

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Decision
from ..storage import save_pdf
from ..workflow.submit_invoice import Submission, submit_invoice
from .session import new_expiry_timestamp, sweep_expired_uploads
from .validate_upload import validate_upload


@dataclass
class UploadProcessResult:
    ok: bool
    invoice_id: str | None = None
    outcome: str | None = None
    reason: str | None = None  # validation | processing_incomplete | processing_failed
    error: str | None = None
    message: str | None = None


def process_upload(db: Session, data: bytes, original_file_name: str, session_token: str) -> UploadProcessResult:
    """Runs one upload through the full existing pipeline (validate → store
    → idempotent intake → extraction/matching/decision) under the
    upload-mode policy. `session_token` scopes storage path, duplicate
    detection, and the `expires_at` deletion deadline set on the invoice
    row."""
    from ..workflow.process_invoice_job import process_next_invoice_job

    validation = validate_upload(data, original_file_name)
    if not validation.ok:
        return UploadProcessResult(ok=False, reason="validation", error=validation.error, message=validation.message)

    sweep_expired_uploads(db)  # opportunistic — see session.py

    digest = hashlib.sha256(data).hexdigest()
    storage_path = f"uploads/{session_token}/{digest}.pdf"

    submission = submit_invoice(
        db,
        Submission(
            submission_id=f"upload:{session_token}:{digest}",
            source="upload",
            original_file_name=original_file_name,
            file_hash=digest,
            mime_type="application/pdf",
            received_at=datetime.now(UTC),
            session_token=session_token,
            expires_at=new_expiry_timestamp(),
        ),
        storage_path,
    )

    # Replay of the same file within the same session (or a retried
    # request): the pipeline already ran or is running under this exact
    # submission id — never re-store the object or re-trigger extraction,
    # the same idempotency guarantee submit_invoice gives every intake path.
    if not submission.is_replay:
        save_pdf(storage_path, data)

    max_iterations = settings().max_drain_iterations
    for _ in range(max_iterations):
        decision = db.scalar(select(Decision).where(Decision.invoice_id == submission.invoice_id))
        if decision:
            return UploadProcessResult(ok=True, invoice_id=submission.invoice_id, outcome=decision.outcome)

        job_result = process_next_invoice_job(db)
        if not job_result["processed"]:
            break  # queue empty — nothing left to drain

        if "error" in job_result and job_result["invoice_id"] == submission.invoice_id:
            return UploadProcessResult(
                ok=False, reason="processing_failed", invoice_id=submission.invoice_id, message=job_result["error"]
            )

    # One last check in case the final drain iteration wrote the decision
    # but this loop's early-exit raced past reading it.
    final_decision = db.scalar(select(Decision).where(Decision.invoice_id == submission.invoice_id))
    if final_decision:
        return UploadProcessResult(ok=True, invoice_id=submission.invoice_id, outcome=final_decision.outcome)

    return UploadProcessResult(ok=False, reason="processing_incomplete", invoice_id=submission.invoice_id)
