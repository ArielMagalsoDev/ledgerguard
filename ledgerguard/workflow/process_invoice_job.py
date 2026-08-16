"""Claims and runs exactly one queued `process_invoice` job. Callers loop
this to drain the queue.

Stage order: claim job → load invoice → load PDF from disk → load active
policy (upload source appends "+upload-sandbox-v1") → reserve spend →
extract (Claude or fallback) → persist extracted fields + arithmetic
controls → decide (supplier/bank/duplicate/PO/screening) → persist
match/decision + remaining controls → audit events per stage, committed as
they happen so a poller sees stages land one at a time."""

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import write_audit_event
from ..config import POLICY_VERSION, settings
from ..extraction.align_evidence import extracted_to_dict
from ..extraction.extract import extract_invoice
from ..limits import refund_spend, reserve_spend
from ..matching.decide import DecideOptions, decide_invoice
from ..models import Control, Decision, Invoice, Job, MatchResult, Policy
from ..policy import parse_policy_config
from ..storage import load_pdf

SPEND_ESTIMATE_USD = 0.02  # conservative ceiling for one extraction call, refunded down to actual cost
ARITHMETIC_CONTROL_IDS = {"arithmetic_line_totals", "arithmetic_subtotal", "arithmetic_tax_total"}


def _count_verified(extracted: dict) -> tuple[int, int]:
    header_fields = [
        extracted.get(k)
        for k in (
            "invoiceNumber", "invoiceDate", "dueDate", "supplierName", "supplierTaxId",
            "purchaseOrderNumber", "currency", "subtotal", "tax", "total", "remittanceDetails", "notes",
        )
    ]
    header_fields = [f for f in header_fields if f is not None]
    line_fields = [
        li[k] for li in extracted["lineItems"] for k in ("description", "quantity", "unitPrice", "lineTotal")
    ]
    all_fields = header_fields + line_fields
    verified = sum(1 for f in all_fields if f.status == "verified")
    return verified, len(all_fields)


def _insert_control(db: Session, invoice_id, control: dict) -> None:
    db.add(
        Control(
            invoice_id=invoice_id,
            control_id=control["controlId"],
            label=control["label"],
            status=control["status"],
            severity=control["severity"],
            reason=control["reason"],
            evidence_references=control["evidenceReferences"],
            blocking=control["blocking"],
        )
    )


def process_next_invoice_job(db: Session) -> dict:
    job = db.scalar(
        select(Job)
        .where(Job.status == "queued", Job.available_at <= datetime.now(UTC))
        .order_by(Job.available_at)
        .with_for_update(skip_locked=True)
    )
    if not job:
        return {"processed": False}

    job.status = "running"
    job.attempts += 1
    job.locked_at = datetime.now(UTC)
    db.commit()

    invoice = db.get(Invoice, job.invoice_id)
    if not invoice:
        job.status = "failed_permanent"
        job.last_error = "invoice row not found"
        db.commit()
        return {"processed": True, "invoice_id": str(job.invoice_id), "error": "invoice row not found"}

    try:
        invoice.status = "processing"
        db.commit()

        if not invoice.storage_path:
            raise RuntimeError("invoice has no storage_path — nothing to extract from")

        pdf_bytes = load_pdf(invoice.storage_path)

        write_audit_event(
            db, invoice.id, "file_validated", "File validated",
            f"{invoice.mime_type}, {len(pdf_bytes)} bytes, read from storage.", "system",
        )

        policy_row = db.scalar(select(Policy).where(Policy.active.is_(True)).order_by(Policy.created_at.desc()))
        base_policy_version = policy_row.version if policy_row else POLICY_VERSION

        # Upload sandbox: source == "upload" runs under the upload-mode
        # policy — an unmatched supplier becomes a non-blocking exception
        # instead of an instant block, and the outcome can never reach
        # ready_for_approval. Every other source is unaffected.
        is_upload = invoice.source == "upload"
        policy_version = f"{base_policy_version}+upload-sandbox-v1" if is_upload else base_policy_version
        raw_config = policy_row.config if policy_row else {}
        tax_rounding_tolerance_usd = raw_config.get("taxRoundingToleranceUsd", 0.02)

        reservation = reserve_spend(db, SPEND_ESTIMATE_USD)
        if not reservation["allowed"]:
            raise RuntimeError("daily spend cap reached — extraction deferred, job will retry")

        try:
            result = extract_invoice(pdf_bytes, tax_rounding_tolerance_usd)
        except Exception:
            refund_spend(db, SPEND_ESTIMATE_USD)
            raise

        over_reserved = SPEND_ESTIMATE_USD - result.cost_usd
        if over_reserved > 0:
            refund_spend(db, over_reserved)

        write_audit_event(
            db, invoice.id, "extraction_complete", "Structured extraction complete",
            f"Header and {len(result.extracted['lineItems'])} line item(s) extracted to schema.",
            "ai_model" if settings().anthropic_api_key else "system", result.latency_ms, result.cost_usd,
        )

        verified, total_fields = _count_verified(result.extracted)
        write_audit_event(
            db, invoice.id, "evidence_aligned", "Evidence coordinates aligned",
            f"{verified} of {total_fields} fields aligned against the real document text layer; "
            f"{total_fields - verified} unresolved.", "system",
        )

        write_audit_event(
            db, invoice.id, "arithmetic_checked", "Arithmetic recalculated",
            " ".join(c["reason"] for c in result.arithmetic_controls), "system",
        )

        def to_numeric(v):
            return float(v) if v is not None else None

        def to_date(v):
            if not v:
                return None
            try:
                return date.fromisoformat(v)
            except ValueError:
                return None

        invoice.extracted = extracted_to_dict(result.extracted)
        invoice.invoice_number = result.extracted["invoiceNumber"].value
        invoice.invoice_number_normalized = result.extracted["invoiceNumber"].normalized_value
        invoice.invoice_date = to_date(result.extracted["invoiceDate"].value)
        invoice.due_date = to_date(result.extracted["dueDate"].value)
        invoice.currency = result.extracted["currency"].value
        invoice.subtotal = to_numeric(result.extracted["subtotal"].value)
        invoice.tax = to_numeric(result.extracted["tax"].value)
        invoice.total = to_numeric(result.extracted["total"].value)
        invoice.policy_version = policy_version
        db.commit()

        for control in result.arithmetic_controls:
            _insert_control(db, invoice.id, control)
        db.commit()

        if result.requires_review:
            write_audit_event(
                db, invoice.id, "extraction_requires_review", "Extraction requires review",
                "Required field(s) not independently verified against the document: "
                f"{', '.join(result.problem_fields)}. Held here — nothing downstream may treat these as confirmed.",
                "system",
            )

        # --- matching, duplicate/bank-detail checks, PO/receipt matching, decision ---
        policy_config = parse_policy_config(raw_config)
        decide_options = DecideOptions(upload_mode=True, upload_session_token=invoice.session_token) if is_upload else None
        decision_result = decide_invoice(
            db, invoice.id, invoice.workflow_id, result.extracted, result.arithmetic_controls,
            result.requires_review, result.problem_fields, policy_version, policy_config, decide_options,
        )

        for control in decision_result["new_controls"]:
            if control["controlId"] in ARITHMETIC_CONTROL_IDS:
                continue  # already inserted above
            _insert_control(db, invoice.id, control)
        db.commit()

        control_by_id = {c["controlId"]: c for c in decision_result["new_controls"]}
        supplier_control = control_by_id.get("supplier_identity")
        duplicate_control = control_by_id.get("duplicate_identity_check")
        bank_control = control_by_id.get("bank_detail_change")
        screening_control = control_by_id.get("source_screening")
        po_related = [c for c in decision_result["new_controls"] if c["controlId"].startswith("po_")]

        if supplier_control:
            write_audit_event(db, invoice.id, "supplier_matched", "Supplier matched", supplier_control["reason"], "system")
        if duplicate_control:
            write_audit_event(
                db, invoice.id, "duplicate_checked",
                "Duplicate check: exact match found" if decision_result["decision"]["outcome"] == "duplicate_hold" else "Duplicate check complete",
                duplicate_control["reason"], "system",
            )
        if bank_control and bank_control["status"] != "not_applicable":
            write_audit_event(
                db, invoice.id, "bank_detail_compared",
                "Bank-detail comparison: mismatch" if bank_control["status"] == "failed" else "Bank-detail comparison: match",
                bank_control["reason"], "system",
            )
        if po_related:
            write_audit_event(
                db, invoice.id, "po_matched", f"PO matched — {decision_result['match']['purchaseOrderMatch']}",
                " ".join(c["reason"] for c in po_related), "system",
            )
        if screening_control:
            write_audit_event(
                db, invoice.id, "source_screened",
                "Instruction screening: FLAGGED" if screening_control["status"] == "warning" else "Instruction screening",
                screening_control["reason"], "system",
            )

        match = decision_result["match"]
        existing_match = db.scalar(select(MatchResult).where(MatchResult.invoice_id == invoice.id))
        if existing_match:
            db.delete(existing_match)
            db.flush()
        db.add(
            MatchResult(
                invoice_id=invoice.id,
                supplier_id=match["supplierId"],
                supplier_match=match["supplierMatch"],
                purchase_order_id=match["purchaseOrderId"],
                purchase_order_match=match["purchaseOrderMatch"],
                receipt_ids=match["receiptIds"],
                duplicate_candidates=match["duplicateCandidates"],
            )
        )

        decision = decision_result["decision"]
        existing_decision = db.scalar(select(Decision).where(Decision.invoice_id == invoice.id))
        if existing_decision:
            db.delete(existing_decision)
            db.flush()
        db.add(
            Decision(
                invoice_id=invoice.id,
                workflow_id=invoice.workflow_id,
                outcome=decision["outcome"],
                reason=decision["reason"],
                approval_route=decision["approvalRoute"] or [],
                proposed_accounting_change=decision["proposedAccountingChange"],
                required_actions=decision["requiredActions"],
                policy_version=decision["policyVersion"],
            )
        )
        db.commit()

        write_audit_event(
            db, invoice.id, "decision_made", f"Decision: {decision['outcome'].replace('_', ' ')}",
            decision["reason"], "system",
        )

        if decision["proposedAccountingChange"]:
            change = decision["proposedAccountingChange"]
            write_audit_event(
                db, invoice.id, "accounting_draft_prepared", "Accounting draft prepared",
                f"Draft bill proposed for supplier {change['supplierId']}, total ${change['total']} — not posted.",
                "system",
            )

        invoice.status = decision["outcome"]
        invoice.supplier_id = match["supplierId"]
        invoice.purchase_order_id = match["purchaseOrderId"]
        db.commit()

        job.status = "completed"
        db.commit()

        return {"processed": True, "invoice_id": str(invoice.id), "outcome": decision["outcome"]}

    except Exception as exc:  # noqa: BLE001 — job-failure boundary: any exception marks the job failed
        db.rollback()
        job = db.get(Job, job.id)
        message = str(exc)
        is_permanent = job.attempts >= job.max_attempts
        job.status = "failed_permanent" if is_permanent else "failed_transient"
        job.last_error = message
        db.commit()

        write_audit_event(
            db, invoice.id, "processing_failed",
            "Processing failed permanently" if is_permanent else "Processing failed, will retry",
            message, "system",
        )

        return {"processed": True, "invoice_id": str(invoice.id), "error": message}
