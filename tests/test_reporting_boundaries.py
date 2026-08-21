from datetime import UTC, datetime

from ledgerguard.main import _eval_split_summary
from ledgerguard.models import Decision, Invoice
from ledgerguard.ops import get_operations_summary
from ledgerguard.queue_.queue_data import get_queue_items


def _invoice(submission_id: str, status: str) -> Invoice:
    return Invoice(
        submission_id=submission_id,
        workflow_id=f"wf_{submission_id}",
        source="demo_scenario",
        original_file_name=f"{submission_id}.pdf",
        file_hash=f"sha256:{submission_id}",
        mime_type="application/pdf",
        received_at=datetime.now(UTC),
        storage_path=f"test/{submission_id}.pdf",
        status=status,
        invoice_number=submission_id,
    )


def _decision(invoice: Invoice, outcome: str) -> Decision:
    return Decision(
        invoice_id=invoice.id,
        workflow_id=invoice.workflow_id,
        outcome=outcome,
        reason="Regression-test decision.",
        approval_route=["controller"],
        required_actions=[],
        policy_version="test-policy",
    )


def test_held_out_summary_uses_split_counts_not_overall_score():
    metrics = {
        "passed": 35,
        "total": 50,
        "heldOut": {
            "byCategory": {
                "clean": {"passed": 0, "total": 2},
                "duplicate": {"passed": 2, "total": 2},
                "policy": {"passed": 6, "total": 6},
            }
        },
    }

    assert _eval_split_summary(metrics, "heldOut") == {"passed": 8, "total": 10}


def test_operational_views_exclude_evaluation_cases(db_session):
    operational = _invoice("sub_demo_clean", "ready_for_approval")
    evaluation = _invoice("sub_eval_heldout_clean_001", "exception_review")
    db_session.add_all([operational, evaluation])
    db_session.flush()
    db_session.add_all(
        [
            _decision(operational, "ready_for_approval"),
            _decision(evaluation, "exception_review"),
        ]
    )
    db_session.commit()

    queue_items = get_queue_items(db_session)
    operations = get_operations_summary(db_session)

    assert [item["invoiceNumber"] for item in queue_items] == ["sub_demo_clean"]
    assert operations["totalInvoices"] == 1
    assert operations["decidedInvoices"] == 1
    assert operations["invoicesByStatus"] == [{"status": "ready_for_approval", "count": 1}]
