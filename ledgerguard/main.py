from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .author import AUTHOR
from .config import settings
from .db import init_db, session_scope
from .extraction.arithmetic import compute_arithmetic_controls
from .extraction.validate import validate_required_fields
from .fixtures.projects import PROJECTS
from .matching.decide import decide_invoice
from .models import AuditEvent, Control, Decision, Invoice, MatchResult, ReviewAction, ensure_aware
from .money import parse_decimal_to_cents
from .outcome import OUTCOME_META
from .policy import parse_policy_config
from .queue_.live_scenario import get_all_live_scenarios
from .schemas import LINE_FIELDS, MONETARY_FIELDS, FieldCorrectionIn, InvoiceSubmissionIn, ReviewActionIn
from .seed import seed_all
from .workflow.submit_invoice import Submission, submit_invoice

ROOT = Path(__file__).parent
templates = Jinja2Templates(directory=ROOT / "templates")
# Available in every template without threading it through each route's
# context — read once from the environment at the root.
templates.env.globals["upload_sandbox_enabled"] = settings().upload_sandbox_enabled
# OUTCOME_META is shared by partials/outcome_badge.html
# and any page (queue, operations, demo) that reads outcome colors/labels directly.
templates.env.globals["OUTCOME_META"] = OUTCOME_META
# AUTHOR is read by partials/header.html,
# partials/footer.html, and partials/recruiter_proof.html.
templates.env.globals["AUTHOR"] = AUTHOR
# A Jinja global computed once per process is close enough for a copyright
# line and avoids threading the year through every route that renders the
# footer.
templates.env.globals["current_year"] = datetime.now().year

# Schema creation + seeding run at import time rather than in an ASGI
# lifespan hook: serverless ASGI adapters don't reliably invoke `lifespan`,
# but module import always runs exactly once before any request is served.
# Both calls are idempotent/retry-safe.
init_db()
with session_scope() as _startup_db:
    seed_all(_startup_db)

app = FastAPI(title="LedgerGuard", version="1.0.0")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.exception_handler(FastAPIHTTPException)
async def http_exception_handler(request: Request, exc: FastAPIHTTPException):
    """Unwraps dict details to the top level so API errors are shaped
    {"error": "...", ...} rather than FastAPI's default {"detail": {...}}."""
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


def db_session():
    with session_scope() as db:
        yield db


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
# Used only by the homepage stat
# strip below. evals.html defines its own copy as a local Jinja macro instead
# of sharing this one, since it needs no-arg default handling inside a template.
def _format_metric(value: object, fmt: str) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return "n/a"
    if fmt == "pct":
        return f"{value * 100:.1f}%"
    if fmt == "ms":
        return f"{value / 1000:.1f}s"
    return f"${value:.4f}"


# "Critical false clearances" reads the SAME held-out metric /evals shows,
# via the same get_latest_run() call — no separate hardcoded number that
# could quietly disagree with the evaluation page.
def _build_stats(false_clearance_rate: str) -> list[dict]:
    return [
        {"value": "Solo", "label": "End-to-end ownership", "note": "Product design through deployment"},
        {"value": "5/5", "label": "Controls visible", "note": "Every decision stays inspectable"},
        {"value": false_clearance_rate, "label": "Critical false clearances", "note": "Unsafe invoices cleared incorrectly, held-out set"},
        {"value": "$0", "label": "Payment authority", "note": "Public workflow cannot execute payment"},
    ]


OUTCOME_ORDER = ["ready_for_approval", "exception_review", "duplicate_hold", "blocked"]


@app.get("/", response_class=HTMLResponse)
def home(request: Request, db: Session = Depends(db_session)):
    from .evals.latest_run import get_latest_run

    run = get_latest_run(db)
    held_out_metrics = (run.metrics or {}).get("heldOut", {}) if run else {}
    false_clearance_rate = _format_metric(held_out_metrics.get("falseClearanceRate"), "pct") if run else "n/a"
    # Reuses the same get_latest_run() call above — the escalation strip's
    # metric can never quietly disagree with what /evals shows because it is
    # not a second query.
    escalation_metric = {"value": f"{run.passed_cases}/{run.total_cases}", "label": "held-out cases passed"} if run else None

    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "projects": PROJECTS,
            "stats": _build_stats(false_clearance_rate),
            "escalation_metric": escalation_metric,
            "outcome_order": OUTCOME_ORDER,
        },
    )


@app.get("/demo", response_class=HTMLResponse)
def demo(request: Request, db: Session = Depends(db_session)):
    scenarios = get_all_live_scenarios(db)
    return templates.TemplateResponse(request, "demo.html", {"scenarios": scenarios})


@app.get("/queue", response_class=HTMLResponse)
def queue(request: Request, db: Session = Depends(db_session)):
    from .queue_.queue_data import get_queue_invoices

    invoices = get_queue_invoices(db, supplier=request.query_params.get("supplier"), property_code=request.query_params.get("property"))
    return templates.TemplateResponse(request, "queue.html", {"invoices": invoices})


@app.get("/evals", response_class=HTMLResponse)
def evals(request: Request, db: Session = Depends(db_session)):
    from .evals.latest_run import get_latest_run, get_latest_upload_run

    return templates.TemplateResponse(
        request, "evals.html", {"run": get_latest_run(db), "upload_run": get_latest_upload_run(db)}
    )


@app.get("/architecture", response_class=HTMLResponse)
def architecture(request: Request):
    return templates.TemplateResponse(request, "architecture.html", {})


@app.get("/operations", response_class=HTMLResponse)
def operations(request: Request, db: Session = Depends(db_session)):
    from .ops import get_operations_summary

    return templates.TemplateResponse(request, "operations.html", get_operations_summary(db))


@app.get("/case-study", response_class=HTMLResponse)
def case_study(request: Request):
    return templates.TemplateResponse(request, "case_study.html", {})


@app.get("/try", response_class=HTMLResponse)
def try_page(request: Request):
    if not settings().upload_sandbox_enabled:
        return templates.TemplateResponse(request, "try_disabled.html", {}, status_code=404)
    return templates.TemplateResponse(
        request,
        "try.html",
        {"turnstile_site_key": settings().turnstile_site_key, "rate_limit_per_hour": settings().rate_limit_per_hour},
    )


# ---------------------------------------------------------------------------
# API — invoice intake, review actions, field correction
# ---------------------------------------------------------------------------
def _run_pipeline_inline(db: Session, invoice_id: UUID) -> None:
    """Serverless-friendly synchronous run of one job, used when
    `inline_processing` is set (no persistent worker process available)."""
    from .workflow.process_invoice_job import process_next_invoice_job

    process_next_invoice_job(db)


@app.post("/api/invoices", status_code=201)
def create_invoice(body: dict, db: Session = Depends(db_session)):
    try:
        parsed = InvoiceSubmissionIn.model_validate(body)
    except ValidationError as exc:
        return JSONResponse(status_code=400, content={"error": "invalid_submission", "details": exc.errors()})

    file_hash = parsed.fileHash
    storage_path = f"demo-scenarios/{parsed.scenarioKey}.pdf" if parsed.scenarioKey else f"intake/{file_hash}.pdf"

    result = submit_invoice(
        db,
        Submission(
            submission_id=parsed.submissionId,
            source=parsed.source,
            original_file_name=parsed.originalFileName,
            file_hash=file_hash,
            mime_type=parsed.mimeType,
            received_at=parsed.receivedAt,
            sender_email=parsed.senderEmail,
            scenario_key=parsed.scenarioKey,
        ),
        storage_path,
    )

    if not result.is_replay and settings().inline_processing:
        _run_pipeline_inline(db, UUID(result.invoice_id))

    status_code = 200 if result.is_replay else 201
    return JSONResponse(
        status_code=status_code,
        content={"invoiceId": result.invoice_id, "workflowId": result.workflow_id, "status": result.status, "isReplay": result.is_replay},
    )


@app.post("/api/invoices/{invoice_id}/actions")
def invoice_action(invoice_id: UUID, body: dict, db: Session = Depends(db_session)):
    try:
        parsed = ReviewActionIn.model_validate(body)
    except ValidationError as exc:
        return JSONResponse(status_code=400, content={"error": "invalid_body", "details": exc.errors()})
    if parsed.action == "rejected" and not parsed.comment:
        return JSONResponse(status_code=400, content={"error": "invalid_body", "details": "comment is required to reject"})
    if parsed.action == "reassigned" and not parsed.reassignedTo:
        return JSONResponse(status_code=400, content={"error": "invalid_body", "details": "reassignedTo is required"})
    if parsed.action == "commented" and not parsed.comment:
        return JSONResponse(status_code=400, content={"error": "invalid_body", "details": "comment is required"})

    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        return JSONResponse(status_code=404, content={"error": "invoice_not_found"})

    decision = db.scalar(select(Decision).where(Decision.invoice_id == invoice_id))
    if not decision:
        return JSONResponse(
            status_code=409,
            content={"error": "invoice_not_decided", "detail": "This invoice hasn't been through the decision pipeline yet — nothing to review."},
        )
    outcome = decision.outcome
    approval_route = decision.approval_route or []

    if parsed.action in ("approved", "rejected"):
        latest = db.scalar(
            select(ReviewAction).where(ReviewAction.invoice_id == invoice_id).order_by(ReviewAction.created_at.desc()).limit(1)
        )
        if latest and latest.action in ("approved", "rejected"):
            return JSONResponse(
                status_code=409,
                content={"error": "already_resolved", "detail": f"This invoice was already {latest.action} — resolution is final."},
            )

    # Server-side re-checks — the actual enforcement boundary; never trust
    # that a disabled button was really disabled.
    if parsed.action == "approved":
        if outcome == "duplicate_hold":
            return JSONResponse(
                status_code=403,
                content={"error": "cannot_approve_duplicate_hold", "detail": "A duplicate hold is never approved directly — investigate and reject/dismiss it instead."},
            )
        is_authorized = parsed.actorRole in approval_route or parsed.actorRole == "controller"
        if not is_authorized:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "not_authorized_for_role",
                    "detail": f"This invoice routes to [{', '.join(approval_route) or 'no one'}] — \"{parsed.actorRole}\" cannot approve it.",
                },
            )
        if outcome == "blocked" and not parsed.comment:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "verification_note_required",
                    "detail": "Approving a blocked invoice requires a comment recording how it was verified out-of-band.",
                },
            )

    action_row = ReviewAction(
        invoice_id=invoice_id,
        action=parsed.action,
        actor_role=parsed.actorRole,
        actor_name=parsed.actorName,
        comment=parsed.comment,
        reassigned_to=parsed.reassignedTo if parsed.action == "reassigned" else None,
    )
    db.add(action_row)
    db.commit()

    if parsed.action == "reassigned":
        detail = f"{parsed.actorName} ({parsed.actorRole}) reassigned this invoice to {parsed.reassignedTo}." + (f' "{parsed.comment}"' if parsed.comment else "")
    elif parsed.comment:
        detail = f"{parsed.actorName} ({parsed.actorRole}): {parsed.comment}"
    else:
        detail = f'{parsed.actorName} ({parsed.actorRole}) recorded "{parsed.action}".'

    db.add(AuditEvent(invoice_id=invoice_id, stage="human_decision", label=f"Invoice {parsed.action}", detail=detail, actor="human"))
    db.commit()

    return {"ok": True, "action": parsed.action}


@app.patch("/api/invoices/{invoice_id}/fields")
def correct_field(invoice_id: UUID, body: dict, db: Session = Depends(db_session)):
    try:
        parsed = FieldCorrectionIn.model_validate(body)
    except ValidationError as exc:
        return JSONResponse(status_code=400, content={"error": "invalid_body", "details": exc.errors()})

    if parsed.field in MONETARY_FIELDS and parsed.field != "quantity" and parse_decimal_to_cents(parsed.value) is None:
        return JSONResponse(status_code=400, content={"error": "invalid_monetary_value"})
    if parsed.field == "quantity":
        try:
            float(parsed.value)
        except ValueError:
            return JSONResponse(status_code=400, content={"error": "invalid_quantity_value"})

    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        return JSONResponse(status_code=404, content={"error": "invoice_not_found"})

    extracted = invoice.extracted or {}
    corrected_field = {"field": parsed.field, "value": parsed.value, "confidence": 1, "status": "verified", "evidence": []}

    if parsed.field in LINE_FIELDS:
        if parsed.lineNumber is None:
            return JSONResponse(status_code=400, content={"error": "line_number_required"})
        line = next((li for li in extracted.get("lineItems", []) if li["lineNumber"] == parsed.lineNumber), None)
        if not line:
            return JSONResponse(status_code=404, content={"error": "line_not_found"})
        line[parsed.field] = corrected_field
        detail = f'Line {parsed.lineNumber} field "{parsed.field}" corrected by a human reviewer to "{parsed.value}".'
    else:
        extracted[parsed.field] = corrected_field
        detail = f'Field "{parsed.field}" corrected by a human reviewer to "{parsed.value}".'

    invoice.extracted = extracted
    if parsed.field == "invoiceNumber":
        invoice.invoice_number = parsed.value
    elif parsed.field == "invoiceDate":
        invoice.invoice_date = datetime.fromisoformat(parsed.value).date() if parsed.value else None
    elif parsed.field == "dueDate":
        invoice.due_date = datetime.fromisoformat(parsed.value).date() if parsed.value else None
    elif parsed.field == "currency":
        invoice.currency = parsed.value
    elif parsed.field in ("subtotal", "tax", "total"):
        setattr(invoice, parsed.field, float(parsed.value))
    db.commit()

    db.add(AuditEvent(invoice_id=invoice_id, stage="field_corrected", label="Field corrected", detail=detail, actor="human"))
    db.commit()

    # --- Recompute: arithmetic, then the full decision engine ---
    from .config import POLICY_VERSION
    from .models import Policy

    policy_row = db.scalar(select(Policy).where(Policy.active.is_(True)).order_by(Policy.created_at.desc()))
    policy_version = policy_row.version if policy_row else (invoice.policy_version or POLICY_VERSION)
    policy_config = parse_policy_config(policy_row.config if policy_row else None)

    # Re-hydrate `extracted` into ExtractedFieldValue objects so it can flow
    # through the same arithmetic/decide code the live pipeline uses.
    from .extraction.align_evidence import ExtractedFieldValue

    def rehydrate(d: dict) -> ExtractedFieldValue:
        return ExtractedFieldValue(field=d["field"], value=d["value"], confidence=d.get("confidence", 0), status=d["status"], evidence=d.get("evidence", []))

    rehydrated = {k: rehydrate(v) for k, v in extracted.items() if k != "lineItems"}
    rehydrated["lineItems"] = [{k: rehydrate(v) for k, v in li.items() if k != "lineNumber"} | {"lineNumber": li["lineNumber"]} for li in extracted["lineItems"]]

    requires_review, problem_fields = validate_required_fields(rehydrated)
    arithmetic_controls = compute_arithmetic_controls(rehydrated, policy_config.tax_rounding_tolerance_usd)

    existing_decision = db.scalar(select(Decision).where(Decision.invoice_id == invoice_id))
    previous_outcome = existing_decision.outcome if existing_decision else None

    decision_result = decide_invoice(
        db, invoice_id, invoice.workflow_id, rehydrated, arithmetic_controls, requires_review, problem_fields, policy_version, policy_config
    )

    db.query(Control).filter(Control.invoice_id == invoice_id).delete()
    for control in decision_result["new_controls"]:
        db.add(
            Control(
                invoice_id=invoice_id, control_id=control["controlId"], label=control["label"], status=control["status"],
                severity=control["severity"], reason=control["reason"], evidence_references=control["evidenceReferences"], blocking=control["blocking"],
            )
        )

    existing_match = db.scalar(select(MatchResult).where(MatchResult.invoice_id == invoice_id))
    if existing_match:
        db.delete(existing_match)
        db.flush()
    match = decision_result["match"]
    db.add(
        MatchResult(
            invoice_id=invoice_id, supplier_id=match["supplierId"], supplier_match=match["supplierMatch"],
            purchase_order_id=match["purchaseOrderId"], purchase_order_match=match["purchaseOrderMatch"],
            receipt_ids=match["receiptIds"], duplicate_candidates=match["duplicateCandidates"],
        )
    )

    if existing_decision:
        db.delete(existing_decision)
        db.flush()
    decision = decision_result["decision"]
    db.add(
        Decision(
            invoice_id=invoice_id, workflow_id=invoice.workflow_id, outcome=decision["outcome"], reason=decision["reason"],
            approval_route=decision["approvalRoute"] or [], proposed_accounting_change=decision["proposedAccountingChange"],
            required_actions=decision["requiredActions"], policy_version=decision["policyVersion"],
        )
    )

    invoice.status = decision["outcome"]
    invoice.supplier_id = match["supplierId"]
    invoice.purchase_order_id = match["purchaseOrderId"]
    db.commit()

    recompute_detail = (
        f'Outcome changed from "{previous_outcome}" to "{decision["outcome"]}" after the correction above. {decision["reason"]}'
        if previous_outcome and previous_outcome != decision["outcome"]
        else f'Outcome remains "{decision["outcome"]}" after the correction above. {decision["reason"]}'
    )
    db.add(AuditEvent(invoice_id=invoice_id, stage="decision_recomputed", label="Decision recomputed after correction", detail=recompute_detail, actor="system"))
    db.commit()

    return {"ok": True, "field": parsed.field, "lineNumber": parsed.lineNumber, "value": parsed.value, "outcome": decision["outcome"], "previousOutcome": previous_outcome}


# ---------------------------------------------------------------------------
# API — upload sandbox
# ---------------------------------------------------------------------------
import hmac  # noqa: E402

from fastapi import Response, UploadFile  # noqa: E402

from .limits import check_rate_limit, verify_turnstile  # noqa: E402
from .storage import load_pdf  # noqa: E402
from .upload.rate_limit import client_key_from_headers  # noqa: E402
from .upload.session import (  # noqa: E402
    SESSION_COOKIE,
    create_session_token,
    purge_upload_invoice,
    session_cookie_max_age,
    sweep_expired_uploads,
)
from .upload.upload_scenario import get_upload_scenario  # noqa: E402


@app.post("/api/upload", status_code=201)
async def upload_invoice(request: Request, response: Response, db: Session = Depends(db_session)):
    if not settings().upload_sandbox_enabled:
        return JSONResponse(status_code=404, content={"error": "upload_sandbox_disabled"})

    client_key = client_key_from_headers(request)
    rate_limit = check_rate_limit(db, client_key)
    if not rate_limit["allowed"]:
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limited",
                "message": "Too many uploads from this connection in the last hour. Try again later, or explore the seeded scenarios instead.",
            },
        )

    try:
        form = await request.form()
    except Exception:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": "missing_file"})

    file = form.get("file")
    if not file or not isinstance(file, UploadFile):
        return JSONResponse(status_code=400, content={"error": "missing_file"})

    turnstile_token = form.get("turnstileToken")
    if not verify_turnstile(turnstile_token if isinstance(turnstile_token, str) else "", client_key):
        return JSONResponse(status_code=403, content={"error": "turnstile_failed"})

    existing_session_token = request.cookies.get(SESSION_COOKIE)
    session_token = existing_session_token or create_session_token()

    try:
        data = await file.read()
    except Exception:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": "unreadable_file"})

    from .upload.process_upload import process_upload

    result = process_upload(db, data, file.filename or "upload.pdf", session_token)

    if result.ok:
        body, status_code = {"invoiceId": result.invoice_id, "outcome": result.outcome}, 201
    elif result.reason == "validation":
        body, status_code = {"error": result.error, "message": result.message}, 422
    elif result.reason == "processing_failed":
        body, status_code = {"error": "processing_failed", "message": result.message, "invoiceId": result.invoice_id}, 500
    else:
        body, status_code = (
            {
                "error": "processing_incomplete",
                "invoiceId": result.invoice_id,
                "message": "Processing is taking longer than expected — check back at the result URL in a moment.",
            },
            202,
        )

    json_response = JSONResponse(status_code=status_code, content=body)
    if not existing_session_token:
        json_response.set_cookie(
            SESSION_COOKIE, session_token, max_age=session_cookie_max_age(), httponly=True, samesite="lax", path="/"
        )
    return json_response


@app.get("/api/upload/session")
def upload_session_status(request: Request, invoiceId: str | None = None, db: Session = Depends(db_session)):
    session_token = request.cookies.get(SESSION_COOKIE)
    if not session_token or not invoiceId:
        return JSONResponse(status_code=404, content={"state": "not_found"})

    result = get_upload_scenario(db, invoiceId, session_token)
    status_code = 404 if result["state"] == "not_found" else 410 if result["state"] == "expired" else 200
    return JSONResponse(status_code=status_code, content=result)


@app.delete("/api/upload/session")
def upload_session_delete(request: Request, invoiceId: str | None = None, db: Session = Depends(db_session)):
    """"Delete my uploaded document now." Without invoiceId, purges every
    upload this session owns. Verifies session ownership before deleting
    anything."""
    session_token = request.cookies.get(SESSION_COOKIE)
    if not session_token:
        return {"deleted": 0}

    query = select(Invoice).where(Invoice.source == "upload", Invoice.session_token == session_token)
    if invoiceId:
        query = query.where(Invoice.id == invoiceId)
    rows = db.scalars(query).all()

    for row in rows:
        purge_upload_invoice(db, row.id, row.storage_path, session_token, reason="user_requested")

    return {"deleted": len(rows)}


@app.get("/api/upload/session/file")
def upload_session_file(request: Request, invoiceId: str | None = None, db: Session = Depends(db_session)):
    """Streams the visitor's own uploaded PDF back to their browser — the
    storage is private, so this is the only way to render it, and it
    re-checks session ownership on every request rather than ever handing
    out a signed URL a visitor could pass around."""
    session_token = request.cookies.get(SESSION_COOKIE)
    if not session_token or not invoiceId:
        return JSONResponse(status_code=404, content={"error": "not_found"})

    invoice = db.scalar(
        select(Invoice).where(Invoice.id == invoiceId, Invoice.source == "upload", Invoice.session_token == session_token)
    )
    if not invoice or not invoice.storage_path:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    if invoice.expires_at and ensure_aware(invoice.expires_at) < datetime.now(UTC):
        return JSONResponse(status_code=410, content={"error": "expired"})

    try:
        data = load_pdf(invoice.storage_path)
    except OSError:
        return JSONResponse(status_code=404, content={"error": "file_unavailable"})

    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "content-disposition": "inline",
            "cache-control": "private, no-store",
            # Defense-in-depth: content-type above is a fixed literal (never
            # derived from the upload), so there's nothing for a browser to
            # "correct" — this just forbids it from trying.
            "x-content-type-options": "nosniff",
        },
    )


@app.get("/api/upload/cleanup")
def upload_cleanup(request: Request, db: Session = Depends(db_session)):
    """Daily cron backstop for upload deletion — the real deletion
    guarantee is layered: access-time expiry enforcement, an opportunistic
    sweep on every upload-flow request, and this as the backstop that
    catches anything traffic didn't. Gated by CRON_SECRET so it can't be
    triggered publicly."""
    cron_secret = settings().cron_secret
    if not cron_secret:
        return JSONResponse(status_code=500, content={"error": "cron_secret_not_configured"})

    auth_header = request.headers.get("authorization", "")
    provided = auth_header.removeprefix("Bearer ").removeprefix("bearer ")
    if not hmac.compare_digest(provided, cron_secret):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    total_deleted = 0
    # Sweep in bounded batches rather than one unbounded pass.
    for _ in range(20):
        deleted = sweep_expired_uploads(db, 25)
        total_deleted += deleted
        if deleted == 0:
            break

    return {"deleted": total_deleted}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health/live")
def live():
    return {"status": "ok"}


@app.get("/health/ready")
def ready(db: Session = Depends(db_session)):
    db.execute(select(1))
    return {"status": "ok"}
