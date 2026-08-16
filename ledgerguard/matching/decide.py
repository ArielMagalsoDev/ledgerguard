"""The decision orchestrator: supplier identity → bank-detail comparison →
duplicate detection → (short-circuits before PO matching on an exact
duplicate) → PO/receipt matching → instruction screening → outcome +
routing + required actions. Arithmetic controls are the extraction stage's
job and passed in, not recomputed here."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from ..policy import PolicyConfig
from ..routing import compute_approval_route, guess_cost_center
from .bank_detail import compare_bank_details
from .duplicate import check_duplicate
from .instruction_screening import screen_instructions
from .purchase_order import match_purchase_order
from .supplier import resolve_supplier


@dataclass
class DecideOptions:
    # Upload sandbox only. The shipped engine blocks on an unmatched
    # supplier — correct for Keystone's own intake, where that's a fraud
    # signal, but wrong for a public sandbox where an arbitrary invoice not
    # being in the fictional supplier master is the expected, common case.
    # Under upload mode: an unmatched supplier becomes a non-blocking
    # exception instead of an instant block, duplicate detection is scoped
    # away from other visitors' uploads, and the outcome can never reach
    # ready_for_approval — enforced here, not just expected from the checks
    # happening to fail, so a visitor re-uploading a seeded scenario's exact
    # PDF (which *would* legitimately match supplier + PO) still can't walk
    # away with a "the AI approved my invoice" screenshot.
    upload_mode: bool = False
    upload_session_token: str | None = None


def _required_actions_for(outcome: str, blocking_issues: list[dict], requires_review: bool, problem_fields: list[str]) -> list[str]:
    actions: list[str] = []

    if outcome == "duplicate_hold":
        return [
            "AP to confirm with the supplier whether this is a resend of an existing bill or a genuinely new billing period.",
            "Do not create a second accounting draft for this invoice number.",
        ]

    if outcome == "blocked":
        bank_issue = next((c for c in blocking_issues if c["controlId"] == "bank_detail_change"), None)
        if bank_issue:
            return [
                "Call the phone number on file in the approved supplier master — not any number printed on this invoice — to confirm the change.",
                "Do not update supplier bank details from this invoice under any circumstance.",
                "Escalate to the Controller if verification cannot be completed within 2 business days.",
            ]
        return [
            "Confirm this supplier's identity through the standard supplier-onboarding process before any further action.",
            "Do not create a new supplier record automatically from this invoice.",
        ]

    if outcome == "exception_review":
        for issue in blocking_issues:
            actions.append(f"Resolve: {issue['reason']}")
        if requires_review:
            actions.append(
                f"Confirm the field(s) that could not be independently verified against the document: {', '.join(problem_fields)}."
            )

    return actions


def _compose_reason(outcome: str, blocking_issues: list[dict], duplicate_reason: str | None, bank_reason: str | None) -> str:
    if outcome == "duplicate_hold" and duplicate_reason:
        return duplicate_reason
    if outcome == "blocked" and bank_reason:
        return bank_reason
    if outcome == "blocked":
        return blocking_issues[0]["reason"] if blocking_issues else "Blocked pending review."
    if outcome == "exception_review":
        return " ".join(c["reason"] for c in blocking_issues) or "One or more controls require review."
    return "Supplier and purchase-order matching, arithmetic recomputation, and duplicate/bank-detail checks all passed. No exceptions found."


def decide_invoice(
    db: Session,
    invoice_id,
    workflow_id: str,
    extracted: dict,
    arithmetic_controls: list[dict],
    requires_review: bool,
    problem_fields: list[str],
    policy_version: str,
    policy: PolicyConfig,
    options: DecideOptions | None = None,
) -> dict:
    """Returns {"match", "new_controls", "decision"}."""
    options = options or DecideOptions()
    supplier_result = resolve_supplier(db, extracted)
    bank_control = compare_bank_details(extracted, supplier_result["supplier"])
    duplicate_result = check_duplicate(
        db,
        extracted,
        supplier_result["supplier_id"],
        invoice_id,
        options.upload_session_token if options.upload_mode else None,
    )
    instruction_control = screen_instructions(extracted)

    total_usd = float(extracted["total"].value) if extracted["total"].value else 0.0

    # Exact duplicate short-circuits before PO matching entirely.
    if duplicate_result["control"]["status"] == "failed":
        controls = [*arithmetic_controls, supplier_result["control"], duplicate_result["control"], instruction_control]
        match = {
            "supplierId": supplier_result["supplier_id"],
            "supplierMatch": supplier_result["tier"],
            "purchaseOrderId": None,
            "purchaseOrderMatch": "none",
            "receiptIds": [],
            "duplicateCandidates": duplicate_result["candidates"],
        }
        outcome = "duplicate_hold"
        return {
            "match": match,
            "new_controls": controls,
            "decision": {
                "workflowId": workflow_id,
                "outcome": outcome,
                "reason": _compose_reason(outcome, [], duplicate_result["control"]["reason"], None),
                "controls": controls,
                "approvalRoute": compute_approval_route(outcome, total_usd, policy),
                "proposedAccountingChange": None,
                "requiredActions": _required_actions_for(outcome, [], requires_review, problem_fields),
                "policyVersion": policy_version,
            },
        }

    # Critical bank-detail mismatch blocks immediately.
    if bank_control["status"] == "failed":
        controls = [*arithmetic_controls, supplier_result["control"], bank_control, duplicate_result["control"], instruction_control]
        outcome = "blocked"
        match = {
            "supplierId": supplier_result["supplier_id"],
            "supplierMatch": supplier_result["tier"],
            "purchaseOrderId": None,
            "purchaseOrderMatch": "none",
            "receiptIds": [],
            "duplicateCandidates": [],
        }
        return {
            "match": match,
            "new_controls": controls,
            "decision": {
                "workflowId": workflow_id,
                "outcome": outcome,
                "reason": _compose_reason(outcome, [], None, bank_control["reason"]),
                "controls": controls,
                "approvalRoute": compute_approval_route(outcome, total_usd, policy),
                "proposedAccountingChange": None,
                "requiredActions": _required_actions_for(outcome, [bank_control], requires_review, problem_fields),
                "policyVersion": policy_version,
            },
        }

    # Completely unknown supplier is a hard stop for real intake — new
    # suppliers are never created automatically. In upload mode this is the
    # expected common case, so it falls through to the general path below.
    if supplier_result["tier"] == "none" and not options.upload_mode:
        controls = [*arithmetic_controls, supplier_result["control"], bank_control, duplicate_result["control"], instruction_control]
        outcome = "blocked"
        match = {
            "supplierId": None,
            "supplierMatch": "none",
            "purchaseOrderId": None,
            "purchaseOrderMatch": "none",
            "receiptIds": [],
            "duplicateCandidates": [],
        }
        return {
            "match": match,
            "new_controls": controls,
            "decision": {
                "workflowId": workflow_id,
                "outcome": outcome,
                "reason": _compose_reason(outcome, [supplier_result["control"]], None, None),
                "controls": controls,
                "approvalRoute": compute_approval_route(outcome, total_usd, policy),
                "proposedAccountingChange": None,
                "requiredActions": _required_actions_for(outcome, [supplier_result["control"]], requires_review, problem_fields),
                "policyVersion": policy_version,
            },
        }

    supplier_control_for_outcome = supplier_result["control"]
    if options.upload_mode and supplier_result["tier"] == "none":
        supplier_control_for_outcome = {
            **supplier_result["control"],
            "reason": (
                "No approved supplier matches this invoice's tax ID or name — expected for an uploaded "
                "document, since LedgerGuard's public demo only recognizes its fictional supplier master. "
                "New suppliers are never created automatically, so this stays an exception rather than a match."
            ),
        }

    # Otherwise, run PO/receipt matching and evaluate everything together.
    po_result = match_purchase_order(db, extracted, supplier_result["supplier_id"], policy)

    all_controls = [
        *arithmetic_controls,
        supplier_control_for_outcome,
        bank_control,
        duplicate_result["control"],
        *po_result["controls"],
        instruction_control,
    ]

    blocking_issues = [c for c in all_controls if c["blocking"] and c["status"] in ("failed", "warning")]
    natural_outcome = "exception_review" if (requires_review or blocking_issues) else "ready_for_approval"
    # Upload-mode ceiling: never ready_for_approval, even for an invoice that
    # legitimately clears every check.
    outcome = "exception_review" if (options.upload_mode and natural_outcome == "ready_for_approval") else natural_outcome

    match = {
        "supplierId": supplier_result["supplier_id"],
        "supplierMatch": supplier_result["tier"],
        "purchaseOrderId": po_result["purchase_order_id"],
        "purchaseOrderMatch": po_result["tier"],
        "receiptIds": po_result["receipt_ids"],
        "duplicateCandidates": duplicate_result["candidates"],
    }

    proposed_accounting_change = None
    if outcome == "ready_for_approval" and supplier_result["supplier_id"] and extracted["invoiceNumber"].value and extracted["total"].value:
        cc = guess_cost_center(
            supplier_result["supplier"].name if supplier_result["supplier"] else "",
            [li["description"].value or "" for li in extracted["lineItems"]],
        )
        proposed_accounting_change = {
            "idempotencyKey": f"{supplier_result['supplier_id']}:{extracted['invoiceNumber'].value}:keystone_qb_sandbox",
            "action": "create_bill",
            "supplierId": supplier_result["supplier_id"],
            "purchaseOrderId": po_result["purchase_order_id"],
            "invoiceNumber": extracted["invoiceNumber"].value,
            "invoiceDate": extracted["invoiceDate"].value or "",
            "dueDate": extracted["dueDate"].value or extracted["invoiceDate"].value or "",
            "currency": extracted["currency"].value or "USD",
            "total": extracted["total"].value,
            "costCenter": cc["cost_center"],
            "lineItems": [
                {
                    "description": li["description"].value or "",
                    "quantity": li["quantity"].value or "",
                    "unitPrice": li["unitPrice"].value or "",
                    "accountCode": cc["account_code"],
                    "amount": li["lineTotal"].value or "",
                }
                for li in extracted["lineItems"]
            ],
        }

    was_ceilinged = options.upload_mode and natural_outcome == "ready_for_approval" and outcome == "exception_review"
    reason = (
        "Every check passed — supplier identity, arithmetic, PO match, duplicate and bank-detail checks "
        "all agree. LedgerGuard's upload sandbox never auto-approves an uploaded document, though: routed "
        "for human review instead of ready_for_approval."
        if was_ceilinged
        else _compose_reason(outcome, blocking_issues, None, None)
    )
    required_actions = (
        [
            "Confirm this result manually — the upload sandbox caps every uploaded document below "
            "ready_for_approval regardless of how clean the checks come back."
        ]
        if was_ceilinged
        else _required_actions_for(outcome, blocking_issues, requires_review, problem_fields)
    )

    return {
        "match": match,
        "new_controls": all_controls,
        "decision": {
            "workflowId": workflow_id,
            "outcome": outcome,
            "reason": reason,
            "controls": all_controls,
            "approvalRoute": compute_approval_route(outcome, total_usd, policy),
            "proposedAccountingChange": proposed_accounting_change,
            "requiredActions": required_actions,
            "policyVersion": policy_version,
        },
    }
