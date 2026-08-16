"""Upload sandbox — anonymous session cookie handling and deletion. The
session token is a random UUID, never derived from the filename, email, or
document contents. Deletion follows a three-layer approach: access-time
expiry enforcement (checked by callers against `expires_at`), an
opportunistic sweep called from every upload-flow request, and a daily cron
backstop (`GET /api/upload/cleanup`)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import AccountingBill, Invoice, ReviewAction, UploadDeletion
from ..storage import delete_pdf

SESSION_COOKIE = "lg_upload_session"


def create_session_token() -> str:
    return str(uuid.uuid4())


def session_cookie_max_age() -> int:
    """Slightly longer than the data TTL so a slow visitor doesn't lose the
    cookie a moment before the row itself expires — the row's own
    expires_at is the real, authoritative boundary either way."""
    return (settings().session_ttl_minutes + 5) * 60


def new_expiry_timestamp() -> datetime:
    return datetime.now(UTC) + timedelta(minutes=settings().session_ttl_minutes)


def purge_upload_invoice(
    db: Session, invoice_id, storage_path: str | None, session_token: str = "", reason: str = "expired"
) -> None:
    """Deletes one upload invoice and everything derived from it: FK-safe
    order (review_actions/accounting_bills use NO ACTION, not CASCADE —
    deleted explicitly first even though no upload-sourced invoice should
    ever have either, since upload mode structurally can't reach
    ready_for_approval or the review queue) then the invoice row itself,
    which cascades decisions/controls/match_results/audit_events/jobs.
    Storage object deleted last so a storage failure never leaves an
    orphaned-but-unreferenced DB row."""
    db.query(ReviewAction).filter(ReviewAction.invoice_id == invoice_id).delete()
    db.query(AccountingBill).filter(AccountingBill.invoice_id == invoice_id).delete()
    db.query(Invoice).filter(Invoice.id == invoice_id).delete()

    if storage_path:
        try:
            delete_pdf(storage_path)
        except OSError:
            pass

    db.add(UploadDeletion(invoice_id=invoice_id, session_token=session_token, reason=reason))
    db.commit()


def sweep_expired_uploads(db: Session, limit: int = 5) -> int:
    """Opportunistic sweep — called at the top of every upload-flow request
    so expired sessions get purged even without a cron ever running.
    Bounded to a small batch so it never turns a normal request into a slow
    one."""
    now = datetime.now(UTC)
    expired = db.scalars(
        select(Invoice).where(Invoice.source == "upload", Invoice.expires_at < now).limit(limit)
    ).all()

    for row in expired:
        purge_upload_invoice(db, row.id, row.storage_path, row.session_token or "")

    return len(expired)
