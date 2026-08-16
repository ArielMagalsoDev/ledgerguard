"""The real eval runner. Submits every case in cases.py through the actual
intake + job processor (the same pipeline `run_demo_pipeline` exercises),
scores the result against each case's labeled ground truth, and writes one
row to eval_runs — which /evals reads to show real, reproducible numbers.

Metrics are computed separately for the "dev" and "held_out" splits.
held_out is the number that's allowed to be quoted as production proof; dev
is for tuning.

    python -m ledgerguard.evals
"""

import time
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..extraction.pdf_generate import generate_invoice_pdf
from ..models import AccountingBill, AuditEvent, Control, Decision, EvalRun, Invoice, MatchResult, Policy, ReviewAction
from ..storage import save_pdf
from ..workflow.process_invoice_job import process_next_invoice_job
from ..workflow.submit_invoice import Submission, submit_invoice
from .cases import EVAL_CASES

_HEADER_FIELDS = (
    "invoiceNumber", "invoiceDate", "dueDate", "supplierName", "supplierTaxId",
    "purchaseOrderNumber", "currency", "subtotal", "tax", "total", "remittanceDetails", "notes",
)
_LINE_FIELDS = ("description", "quantity", "unitPrice", "taxRate", "lineTotal")


def _all_fields(extracted: dict) -> list[dict]:
    """Every field in a document — header fields plus every line item's
    sub-fields — same enumeration process_invoice_job's _count_verified()
    uses."""
    header = [extracted.get(k) for k in _HEADER_FIELDS]
    header = [f for f in header if f is not None]
    line_fields = [li.get(k) for li in extracted.get("lineItems", []) for k in _LINE_FIELDS if li.get(k) is not None]
    return header + line_fields


def _is_valid_bounding_box(box) -> bool:
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return False
    try:
        x0, y0, x1, y1 = (float(n) for n in box)
    except (TypeError, ValueError):
        return False
    return 0 <= x0 and 0 <= y0 and x1 <= 1 and y1 <= 1 and x0 <= x1 and y0 <= y1


def _tally_fields(extracted: dict) -> dict:
    tally = {"verifiedCount": 0, "verifiedWithValidEvidence": 0, "nonNullCount": 0, "unsupportedCount": 0}
    for field in _all_fields(extracted):
        if field.get("value") is not None:
            tally["nonNullCount"] += 1
            if field.get("status") != "verified":
                tally["unsupportedCount"] += 1
        if field.get("status") == "verified":
            tally["verifiedCount"] += 1
            evidence = field.get("evidence", [])
            if evidence and all(_is_valid_bounding_box(e.get("boundingBox")) for e in evidence):
                tally["verifiedWithValidEvidence"] += 1
    return tally


def _run_case(db: Session, case: dict) -> dict:
    result = {
        "caseId": case["id"], "category": case["category"], "title": case["title"], "split": case.get("split", "dev"),
        "pass": False, "checks": {},
        "actual": {
            "outcome": None, "invoiceNumber": None, "total": None, "supplierMatch": None, "purchaseOrderMatch": None,
            "requiresReview": None, "injectionFlagged": None, "hasDuplicateCandidates": None,
        },
        "fieldTally": {"verifiedCount": 0, "verifiedWithValidEvidence": 0, "nonNullCount": 0, "unsupportedCount": 0},
        "lineItemFieldTotal": 0, "lineItemFieldCorrect": 0, "latencyMs": 0, "costUsd": 0.0,
    }

    try:
        pdf_bytes = generate_invoice_pdf(case["documentLines"])
        storage_path = f"eval-cases/{case['id']}.pdf"
        save_pdf(storage_path, pdf_bytes)

        submission_id = f"sub_eval_{case['id']}_{int(time.time() * 1000)}"
        submission = submit_invoice(
            db,
            Submission(
                submission_id=submission_id, source="upload", original_file_name=f"{case['id']}.pdf",
                file_hash=f"sha256:eval-{case['id']}", mime_type="application/pdf", received_at=datetime.now(UTC),
            ),
            storage_path,
        )

        job_result = process_next_invoice_job(db)
        attempts = 0
        while job_result.get("processed") and job_result.get("invoice_id") != submission.invoice_id and attempts < 20:
            job_result = process_next_invoice_job(db)
            attempts += 1
        if job_result.get("processed") and "error" in job_result:
            raise RuntimeError(f"job processor error: {job_result['error']}")
        if not job_result.get("processed") or job_result.get("invoice_id") != submission.invoice_id:
            raise RuntimeError("job processor never picked up this case's invoice")

        invoice = db.get(Invoice, uuid.UUID(submission.invoice_id))
        if not invoice:
            raise RuntimeError("invoice row not found after processing")
        decision = db.scalar(select(Decision).where(Decision.invoice_id == invoice.id))
        controls = db.scalars(select(Control).where(Control.invoice_id == invoice.id)).all()
        audit_rows = db.scalars(select(AuditEvent).where(AuditEvent.invoice_id == invoice.id)).all()

        extracted = invoice.extracted or {}
        requires_review, _problem_fields = validate_required_fields_dict(extracted)
        screening_control = next((c for c in controls if c.control_id == "source_screening"), None)

        result["fieldTally"] = _tally_fields(extracted)
        result["latencyMs"] = sum(e.latency_ms or 0 for e in audit_rows)
        result["costUsd"] = sum(e.cost_usd or 0 for e in audit_rows)
        result["actual"] = {
            "outcome": decision.outcome if decision else None,
            "invoiceNumber": (extracted.get("invoiceNumber") or {}).get("value"),
            "total": (extracted.get("total") or {}).get("value"),
            "supplierMatch": None, "purchaseOrderMatch": None,
            "requiresReview": requires_review,
            "injectionFlagged": (screening_control.status == "warning") if screening_control else None,
            "hasDuplicateCandidates": None,
        }

        match_row = db.scalar(select(MatchResult).where(MatchResult.invoice_id == invoice.id))
        result["actual"]["supplierMatch"] = match_row.supplier_match if match_row else None
        result["actual"]["purchaseOrderMatch"] = match_row.purchase_order_match if match_row else None
        result["actual"]["hasDuplicateCandidates"] = len(match_row.duplicate_candidates or []) > 0 if match_row else None

        checks = {}
        expected = case["expected"]
        checks["outcome"] = result["actual"]["outcome"] == expected["outcome"]
        if "invoiceNumber" in expected:
            checks["invoiceNumber"] = result["actual"]["invoiceNumber"] == expected["invoiceNumber"]
        if "total" in expected:
            checks["total"] = result["actual"]["total"] == expected["total"]
        if "supplierMatch" in expected:
            checks["supplierMatch"] = result["actual"]["supplierMatch"] == expected["supplierMatch"]
        if "purchaseOrderMatch" in expected:
            checks["purchaseOrderMatch"] = result["actual"]["purchaseOrderMatch"] == expected["purchaseOrderMatch"]
        if "requiresReview" in expected:
            checks["requiresReview"] = result["actual"]["requiresReview"] == expected["requiresReview"]
        if "injectionShouldBeFlagged" in expected:
            checks["injectionFlagged"] = result["actual"]["injectionFlagged"] == expected["injectionShouldBeFlagged"]
        if "injectionShouldChangeOutcome" in expected:
            # The defense held iff the outcome matches what it would be
            # WITHOUT the injected text — the outcome check above already
            # proves this; naming it explicitly for injection-specific cases.
            checks["injectionDidNotChangeOutcome"] = checks["outcome"]
        if "expectDuplicateCandidates" in expected:
            checks["duplicateCandidates"] = result["actual"]["hasDuplicateCandidates"] == expected["expectDuplicateCandidates"]

        if expected.get("lineItems"):
            actual_lines = extracted.get("lineItems", [])
            total, correct = 0, 0
            for idx, expected_line in enumerate(expected["lineItems"]):
                actual_line = actual_lines[idx] if idx < len(actual_lines) else None
                for field in ("description", "quantity", "unitPrice", "lineTotal"):
                    total += 1
                    if actual_line and (actual_line.get(field) or {}).get("value") == expected_line[field]:
                        correct += 1
            result["lineItemFieldTotal"] = total
            result["lineItemFieldCorrect"] = correct
            checks["lineItems"] = total > 0 and correct == total

        result["checks"] = checks
        result["pass"] = all(checks.values())
        return result
    except Exception as exc:  # noqa: BLE001 — a case error is a result, not a runner crash
        result["error"] = str(exc)
        return result


def validate_required_fields_dict(extracted: dict) -> tuple[bool, list[str]]:
    """validate_required_fields() expects ExtractedFieldValue objects with
    attribute access; eval results store plain dicts (post-persistence
    shape). This is the same required-field check applied to dict-shaped
    fields instead."""
    from ..extraction.validate import REQUIRED_HEADER_FIELDS, REQUIRED_LINE_FIELDS

    problem_fields = []
    for key in REQUIRED_HEADER_FIELDS:
        f = extracted.get(key)
        if f is not None and f.get("status") != "verified":
            problem_fields.append(key)
    for line in extracted.get("lineItems", []):
        for sub in REQUIRED_LINE_FIELDS:
            if (line.get(sub) or {}).get("status") != "verified":
                problem_fields.append(f"lineItems[{line.get('lineNumber')}].{sub}")
    return len(problem_fields) > 0, problem_fields


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _rate(numerator: int, denominator: int) -> float | None:
    return None if denominator == 0 else numerator / denominator


def _compute_metrics(results: list[dict], all_cases_by_id: dict[str, dict]) -> dict:
    """Computes the full metrics object over an arbitrary slice of results —
    called once for "held_out", once for "dev", once for "overall" (blended,
    reference only — never the number quoted as production proof)."""
    outcome_checked = [r for r in results if "outcome" in r["checks"]]
    outcome_accuracy = _rate(sum(1 for r in outcome_checked if r["checks"]["outcome"]), len(outcome_checked))

    header_checked = [r for r in results if "invoiceNumber" in r["checks"]]
    header_field_accuracy = _rate(sum(1 for r in header_checked if r["checks"]["invoiceNumber"]), len(header_checked))

    monetary_checked = [r for r in results if "total" in r["checks"]]
    monetary_field_accuracy = _rate(sum(1 for r in monetary_checked if r["checks"]["total"]), len(monetary_checked))

    supplier_checked = [r for r in results if "supplierMatch" in r["checks"]]
    supplier_match_accuracy = _rate(sum(1 for r in supplier_checked if r["checks"]["supplierMatch"]), len(supplier_checked))

    po_checked = [r for r in results if "purchaseOrderMatch" in r["checks"]]
    po_match_accuracy = _rate(sum(1 for r in po_checked if r["checks"]["purchaseOrderMatch"]), len(po_checked))

    ready_expected = [r for r in results if all_cases_by_id.get(r["caseId"], {}).get("expected", {}).get("outcome") == "ready_for_approval"]
    false_clearance_candidates = [r for r in results if all_cases_by_id.get(r["caseId"], {}).get("expected", {}).get("outcome") != "ready_for_approval"]
    false_clearance_rate = _rate(sum(1 for r in false_clearance_candidates if r["actual"]["outcome"] == "ready_for_approval"), len(false_clearance_candidates))
    false_hold_rate = _rate(sum(1 for r in ready_expected if r["actual"]["outcome"] != "ready_for_approval"), len(ready_expected))

    injection_checked = [r for r in results if "injectionFlagged" in r["checks"]]
    injection_defense_hold_rate = _rate(sum(1 for r in injection_checked if r["checks"].get("injectionDidNotChangeOutcome")), len(injection_checked))

    line_item_cases = [r for r in results if r["lineItemFieldTotal"] > 0]
    line_item_field_accuracy = _rate(sum(r["lineItemFieldCorrect"] for r in line_item_cases), sum(r["lineItemFieldTotal"] for r in line_item_cases))

    evidence_coordinate_validity = _rate(
        sum(r["fieldTally"]["verifiedWithValidEvidence"] for r in results), sum(r["fieldTally"]["verifiedCount"] for r in results)
    )
    unsupported_field_rate = _rate(
        sum(r["fieldTally"]["unsupportedCount"] for r in results), sum(r["fieldTally"]["nonNullCount"] for r in results)
    )

    dup_checked = [r for r in results if all_cases_by_id.get(r["caseId"], {}).get("expected", {}).get("expectDuplicateCandidates") is not None]
    tp = fp = fn = 0
    for r in dup_checked:
        expected = all_cases_by_id[r["caseId"]]["expected"]["expectDuplicateCandidates"]
        actual = r["actual"]["hasDuplicateCandidates"]
        if expected and actual:
            tp += 1
        elif not expected and actual:
            fp += 1
        elif expected and not actual:
            fn += 1
    duplicate_precision = _rate(tp, tp + fp)
    duplicate_recall = _rate(tp, tp + fn)

    by_category = {}
    for cat in {r["category"] for r in results}:
        in_cat = [r for r in results if r["category"] == cat]
        by_category[cat] = {"total": len(in_cat), "passed": sum(1 for r in in_cat if r["pass"])}

    return {
        "outcomeAccuracy": outcome_accuracy, "headerFieldAccuracy": header_field_accuracy,
        "monetaryFieldAccuracy": monetary_field_accuracy, "supplierMatchAccuracy": supplier_match_accuracy,
        "poMatchAccuracy": po_match_accuracy, "lineItemFieldAccuracy": line_item_field_accuracy,
        "evidenceCoordinateValidity": evidence_coordinate_validity, "unsupportedFieldRate": unsupported_field_rate,
        "duplicatePrecision": duplicate_precision, "duplicateRecall": duplicate_recall,
        "falseClearanceRate": false_clearance_rate, "falseHoldRate": false_hold_rate,
        "injectionDefenseHoldRate": injection_defense_hold_rate,
        "meanLatencyMs": _mean([r["latencyMs"] for r in results if "error" not in r]),
        "meanCostUsd": _mean([r["costUsd"] for r in results if "error" not in r]),
        "caseCount": len(results), "byCategory": by_category,
    }


def run(db: Session) -> dict:
    # FK-safe cleanup, same pattern as run_demo_pipeline.
    stale_invoices = db.scalars(select(Invoice).where(Invoice.submission_id.like("sub_eval_%"))).all()
    stale_ids = [i.id for i in stale_invoices]
    if stale_ids:
        db.query(AccountingBill).filter(AccountingBill.invoice_id.in_(stale_ids)).delete(synchronize_session=False)
        db.query(ReviewAction).filter(ReviewAction.invoice_id.in_(stale_ids)).delete(synchronize_session=False)
        db.query(Invoice).filter(Invoice.id.in_(stale_ids)).delete(synchronize_session=False)
        db.commit()
    print(f"Cleaned up {len(stale_ids)} prior sub_eval_* invoice(s).\n")
    print(f"Running {len(EVAL_CASES)} eval case(s)...\n")

    all_cases_by_id = {c["id"]: c for c in EVAL_CASES}
    results = []
    for case in EVAL_CASES:
        print(f"  {case['id']} ({case['category']}, {case['split']})... ", end="")
        result = _run_case(db, case)
        results.append(result)
        if "error" in result:
            print(f"ERROR — {result['error']}")
        elif result["pass"]:
            print("PASS")
        else:
            print(f"FAIL — {result['checks']}")

    total = len(results)
    passed = sum(1 for r in results if r["pass"])

    metrics = {
        "heldOut": _compute_metrics([r for r in results if r["split"] == "held_out"], all_cases_by_id),
        "dev": _compute_metrics([r for r in results if r["split"] == "dev"], all_cases_by_id),
        "overall": _compute_metrics(results, all_cases_by_id),
    }

    policy_row = db.scalar(select(Policy).where(Policy.active.is_(True)).order_by(Policy.created_at.desc()))
    model = settings().anthropic_model if settings().anthropic_api_key else "deterministic-fallback"

    db.add(
        EvalRun(
            run_label=f"eval_{datetime.now(UTC).isoformat()}",
            policy_version=policy_row.version if policy_row else "unknown",
            model=model,
            total_cases=total,
            passed_cases=passed,
            metrics=metrics,
            per_case=results,
            mean_latency_ms=int(metrics["overall"]["meanLatencyMs"]),
            total_cost_usd=sum(r["costUsd"] for r in results),
        )
    )
    db.commit()

    print(f"\n{passed}/{total} cases passed.")
    print(f"Held-out metrics (production-proof): {metrics['heldOut']}")
    print(f"Dev metrics (tuning only, not proof): {metrics['dev']}")
    return {"metrics": metrics, "total": total, "passed": passed}
