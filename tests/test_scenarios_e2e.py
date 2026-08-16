"""End-to-end: every guided scenario, run through the real fallback
extraction + decision engine, lands on its labeled outcome."""

import uuid

import pytest

from ledgerguard.extraction.extract import extract_invoice
from ledgerguard.extraction.pdf_generate import generate_invoice_pdf
from ledgerguard.fixtures.scenarios import SCENARIOS
from ledgerguard.matching.decide import decide_invoice
from ledgerguard.policy import DEFAULT_POLICY


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["id"])
def test_scenario_reaches_labeled_outcome(db_session, scenario):
    pdf_bytes = generate_invoice_pdf(scenario["documentLines"])
    result = extract_invoice(pdf_bytes, 0.02)

    decision_result = decide_invoice(
        db_session, uuid.uuid4(), "wf_test", result.extracted, result.arithmetic_controls,
        result.requires_review, result.problem_fields, "policy_2026.3", DEFAULT_POLICY,
    )

    assert decision_result["decision"]["outcome"] == scenario["outcome"]


def test_prompt_injection_flagged_without_leaking(db_session):
    scenario = next(s for s in SCENARIOS if s["id"] == "prompt-injection")
    pdf_bytes = generate_invoice_pdf(scenario["documentLines"])
    result = extract_invoice(pdf_bytes, 0.02)

    decision_result = decide_invoice(
        db_session, uuid.uuid4(), "wf_test", result.extracted, result.arithmetic_controls,
        result.requires_review, result.problem_fields, "policy_2026.3", DEFAULT_POLICY,
    )

    screening = next(c for c in decision_result["new_controls"] if c["controlId"] == "source_screening")
    assert screening["status"] == "warning"
    # The injected text must never leak into a control other than the
    # screening control itself, and must never change the outcome.
    for control in decision_result["new_controls"]:
        if control["controlId"] != "source_screening":
            assert "SYSTEM NOTICE" not in control["reason"]
    assert decision_result["decision"]["outcome"] == "exception_review"
