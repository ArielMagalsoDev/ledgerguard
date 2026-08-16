import uuid
from datetime import UTC, date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> datetime:
    return datetime.now(UTC)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


def ensure_aware(dt: datetime) -> datetime:
    """Postgres round-trips DateTime(timezone=True) columns as tz-aware; SQLite
    (tests, local dev) drops tzinfo on the way back. Comparing/subtracting a
    freshly-fetched column value against `now()` needs this guard so the same
    code works on both — assumes any naive value is already UTC, which is
    true for every timestamp this app writes (`now()` is always UTC)."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


# ---------------------------------------------------------------------------
# Seeded fictional AP master data — Keystone Facilities Group.
# Text primary keys for seeded rows ("sup_apc", "po_10754", ...); anything
# created live gets a fresh uuid4 hex string.
# ---------------------------------------------------------------------------
class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    tax_id: Mapped[str] = mapped_column(String(20))
    tax_id_normalized: Mapped[str] = mapped_column(String(20), index=True)
    approved_domain: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="approved")  # approved | pending | suspended
    bank_name: Mapped[str | None] = mapped_column(String(200))
    bank_account_last4: Mapped[str | None] = mapped_column(String(4))
    bank_routing_last4: Mapped[str | None] = mapped_column(String(4))
    bank_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Property(Base):
    __tablename__ = "properties"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    code: Mapped[str] = mapped_column(String(10), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(120))


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    po_number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"), index=True)
    property_code: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | closed | cancelled
    issued_date: Mapped[date] = mapped_column(Date)
    not_to_exceed: Mapped[float] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="USD")


class PoLine(Base):
    __tablename__ = "po_lines"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    purchase_order_id: Mapped[str] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    line_number: Mapped[int] = mapped_column(Integer)
    sku: Mapped[str | None] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(String(300))
    approved_quantity: Mapped[float] = mapped_column(Numeric(10, 2))
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2))


class Receipt(Base):
    __tablename__ = "receipts"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    purchase_order_id: Mapped[str] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    received_date: Mapped[date] = mapped_column(Date)
    received_by: Mapped[str] = mapped_column(String(120))


class ReceiptLine(Base):
    __tablename__ = "receipt_lines"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    receipt_id: Mapped[str] = mapped_column(ForeignKey("receipts.id"), index=True)
    sku: Mapped[str | None] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(String(300))
    quantity_received: Mapped[float] = mapped_column(Numeric(10, 2))


class CostCenter(Base):
    __tablename__ = "cost_centers"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120))


class Approver(Base):
    __tablename__ = "approvers"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    role: Mapped[str] = mapped_column(String(40), index=True)
    name: Mapped[str] = mapped_column(String(120))
    property_code: Mapped[str | None] = mapped_column(String(10))
    region: Mapped[str | None] = mapped_column(String(60))
    email: Mapped[str | None] = mapped_column(String(200))


class Policy(Base):
    __tablename__ = "policies"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    version: Mapped[str] = mapped_column(String(40), unique=True)
    config: Mapped[dict] = mapped_column(JSON)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


# ---------------------------------------------------------------------------
# Invoices + workflow state
# ---------------------------------------------------------------------------
class ExistingInvoice(Base):
    """The 24 seeded historical invoices — duplicate-detection ground truth,
    not run through the pipeline. Separate table from `Invoice` (which holds
    only pipeline-processed submissions) to keep live rows and seed-time
    historical records cleanly apart."""

    __tablename__ = "existing_invoices"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"), index=True)
    invoice_number: Mapped[str] = mapped_column(String(40))
    invoice_number_normalized: Mapped[str] = mapped_column(String(40), index=True)
    invoice_date: Mapped[date] = mapped_column(Date)
    total: Mapped[float] = mapped_column(Numeric(12, 2))
    original_file_name: Mapped[str] = mapped_column(String(255))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    submission_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    workflow_id: Mapped[str] = mapped_column(String(120))
    source: Mapped[str] = mapped_column(String(20), default="demo_scenario")
    original_file_name: Mapped[str] = mapped_column(String(255))
    file_hash: Mapped[str] = mapped_column(String(80))
    mime_type: Mapped[str] = mapped_column(String(40), default="application/pdf")
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    sender_email: Mapped[str | None] = mapped_column(String(320))
    scenario_key: Mapped[str | None] = mapped_column(String(60), index=True)
    session_token: Mapped[str | None] = mapped_column(String(80), index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    storage_path: Mapped[str] = mapped_column(String(300))
    # received | processing | ready_for_approval | exception_review | duplicate_hold | blocked | failed_transient | failed_permanent
    status: Mapped[str] = mapped_column(String(30), default="received", index=True)
    extracted: Mapped[dict | None] = mapped_column(JSON)

    invoice_number: Mapped[str | None] = mapped_column(String(40))
    invoice_number_normalized: Mapped[str | None] = mapped_column(String(40), index=True)
    invoice_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    currency: Mapped[str | None] = mapped_column(String(3))
    subtotal: Mapped[float | None] = mapped_column(Numeric(12, 2))
    tax: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total: Mapped[float | None] = mapped_column(Numeric(12, 2))

    supplier_id: Mapped[str | None] = mapped_column(ForeignKey("suppliers.id"))
    purchase_order_id: Mapped[str | None] = mapped_column(ForeignKey("purchase_orders.id"))
    policy_version: Mapped[str | None] = mapped_column(String(40))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), index=True)
    job_type: Mapped[str] = mapped_column(String(40), default="process_invoice")
    # queued | running | completed | failed_transient | failed_permanent
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Control(Base):
    __tablename__ = "controls"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), index=True)
    control_id: Mapped[str] = mapped_column(String(60))
    label: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20))  # passed | failed | warning | not_applicable
    severity: Mapped[str] = mapped_column(String(10))  # low | medium | high | critical
    reason: Mapped[str] = mapped_column(Text)
    evidence_references: Mapped[list] = mapped_column(JSON, default=list)
    blocking: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MatchResult(Base):
    __tablename__ = "match_results"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), unique=True, index=True)
    supplier_id: Mapped[str | None] = mapped_column(ForeignKey("suppliers.id"))
    supplier_match: Mapped[str] = mapped_column(String(10), default="none")  # exact | probable | ambiguous | none
    purchase_order_id: Mapped[str | None] = mapped_column(ForeignKey("purchase_orders.id"))
    purchase_order_match: Mapped[str] = mapped_column(String(10), default="none")  # exact|partial|ambiguous|none
    receipt_ids: Mapped[list] = mapped_column(JSON, default=list)
    duplicate_candidates: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Decision(Base):
    __tablename__ = "decisions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), unique=True, index=True)
    workflow_id: Mapped[str] = mapped_column(String(120))
    outcome: Mapped[str] = mapped_column(String(30))
    reason: Mapped[str] = mapped_column(Text)
    approval_route: Mapped[list] = mapped_column(JSON, default=list)
    proposed_accounting_change: Mapped[dict | None] = mapped_column(JSON)
    required_actions: Mapped[list] = mapped_column(JSON, default=list)
    policy_version: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AccountingBill(Base):
    """The proposed-but-never-posted accounting draft — shaped like a QBO
    sandbox change-set output, without the OAuth plumbing behind it."""

    __tablename__ = "accounting_bills"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(160), unique=True)
    action: Mapped[str] = mapped_column(String(20))  # create_bill | update_draft | none
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"))
    purchase_order_id: Mapped[str | None] = mapped_column(ForeignKey("purchase_orders.id"))
    invoice_number: Mapped[str] = mapped_column(String(40))
    invoice_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date)
    currency: Mapped[str] = mapped_column(String(3))
    total: Mapped[float] = mapped_column(Numeric(12, 2))
    cost_center: Mapped[str] = mapped_column(String(20))
    line_items: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft only — never posted
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ReviewAction(Base):
    __tablename__ = "review_actions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), index=True)
    action: Mapped[str] = mapped_column(String(20))  # approved | rejected | reassigned | commented
    actor_role: Mapped[str] = mapped_column(String(40))
    actor_name: Mapped[str] = mapped_column(String(120))
    comment: Mapped[str | None] = mapped_column(Text)
    reassigned_to: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"), index=True)
    stage: Mapped[str] = mapped_column(String(60))
    label: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(20))  # system | ai_model | human
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


# ---------------------------------------------------------------------------
# Abuse controls + upload sandbox + eval infrastructure
# ---------------------------------------------------------------------------
class RateLimitEvent(Base):
    __tablename__ = "rate_limit_events"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    client_key: Mapped[str] = mapped_column(String(120), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class SpendLedger(Base):
    __tablename__ = "spend_ledger"
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    spend_usd: Mapped[float] = mapped_column(Float, default=0.0)


class UploadDeletion(Base):
    __tablename__ = "upload_deletions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"))
    session_token: Mapped[str] = mapped_column(String(80))
    reason: Mapped[str] = mapped_column(String(20))  # expired | user_requested
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class EvalRun(Base):
    __tablename__ = "eval_runs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=new_uuid)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    run_label: Mapped[str] = mapped_column(String(60), index=True)
    policy_version: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(60), default="deterministic-fallback")
    total_cases: Mapped[int] = mapped_column(Integer)
    passed_cases: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    per_case: Mapped[list] = mapped_column(JSON, default=list)
    mean_latency_ms: Mapped[int | None] = mapped_column(Integer)
    total_cost_usd: Mapped[float | None] = mapped_column(Float)
