"""HTTP-level tests against the real FastAPI app. Shares the one file-based
SQLite DB conftest.py points DATABASE_URL at for the whole test session —
main.py's module-level `init_db()` + `seed_all()` already populated it by
the time this fixture runs."""

import uuid

import pytest


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from ledgerguard.main import app

    with TestClient(app) as c:
        yield c


def test_health_ready(client):
    r = client.get("/health/ready")
    assert r.status_code == 200


@pytest.mark.parametrize(
    "path", ["/", "/demo", "/queue", "/evals", "/architecture", "/operations", "/case-study"]
)
def test_pages_render(client, path):
    r = client.get(path)
    assert r.status_code == 200
    assert len(r.text) > 500


def test_try_page_404_when_disabled(client):
    r = client.get("/try")
    assert r.status_code == 404


def test_submit_invoice_invalid_body(client):
    r = client.post("/api/invoices", json={"source": "not_a_real_source"})
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_submission"


def test_submit_invoice_idempotent_replay(client):
    body = {
        "submissionId": f"sub_test_{uuid.uuid4().hex[:8]}",
        "source": "demo_scenario",
        "originalFileName": "test.pdf",
        "fileHash": "sha256:test",
        "mimeType": "application/pdf",
        "receivedAt": "2026-08-16T00:00:00Z",
        "scenarioKey": "clean-match",
    }
    r1 = client.post("/api/invoices", json=body)
    assert r1.status_code == 201
    assert r1.json()["isReplay"] is False

    r2 = client.post("/api/invoices", json=body)
    assert r2.status_code == 200
    assert r2.json()["isReplay"] is True
    assert r2.json()["invoiceId"] == r1.json()["invoiceId"]


def test_actions_on_undecided_invoice_returns_409(client):
    body = {
        "submissionId": f"sub_test_{uuid.uuid4().hex[:8]}",
        "source": "demo_scenario",
        "originalFileName": "test.pdf",
        "fileHash": "sha256:test2",
        "mimeType": "application/pdf",
        "receivedAt": "2026-08-16T00:00:00Z",
        "scenarioKey": "price-quantity-exception",
    }
    submit = client.post("/api/invoices", json=body)
    invoice_id = submit.json()["invoiceId"]

    r = client.post(
        f"/api/invoices/{invoice_id}/actions",
        json={"action": "approved", "actorRole": "controller", "actorName": "Test Approver"},
    )
    assert r.status_code == 409
    assert r.json()["error"] == "invoice_not_decided"


def test_actions_invalid_role_rejected(client):
    r = client.post(
        f"/api/invoices/{uuid.uuid4()}/actions",
        json={"action": "approved", "actorRole": "not_a_real_role", "actorName": "Test"},
    )
    assert r.status_code == 400


def test_approve_then_reapprove_is_rejected_and_queue_shows_resolution(client):
    """A processed, approved invoice: (1) a second approve attempt gets the
    already_resolved 409, and (2) the queue view stops offering a live
    review form for it — the UI and the API enforce the same rule."""
    from ledgerguard.db import session_scope
    from ledgerguard.extraction.pdf_generate import generate_invoice_pdf
    from ledgerguard.fixtures.scenarios import get_scenario
    from ledgerguard.queue_.queue_data import get_queue_items
    from ledgerguard.storage import save_pdf
    from ledgerguard.workflow.process_invoice_job import process_next_invoice_job

    # POST /api/invoices only writes the invoice row pointing at
    # demo-scenarios/<key>.pdf — generating and saving that PDF is normally
    # run_demo_pipeline.py's job, so this test does it directly first.
    # "prompt-injection" (not "clean-match") deliberately: earlier tests in
    # this module leave "clean-match" and "price-quantity-exception" jobs
    # queued but unprocessed, and this test's drain loop below processes
    # everything still queued on its way to its own job — a second
    # "clean-match" invoice submitted after the first is now a genuine exact
    # duplicate (same fictional invoice content), which would correctly
    # land on duplicate_hold instead of the approvable outcome this test
    # needs. Using a scenario key no earlier test touches avoids that.
    save_pdf("demo-scenarios/prompt-injection.pdf", generate_invoice_pdf(get_scenario("prompt-injection")["documentLines"]))

    body = {
        "submissionId": f"sub_test_{uuid.uuid4().hex[:8]}",
        "source": "demo_scenario",
        "originalFileName": "test.pdf",
        "fileHash": "sha256:test3",
        "mimeType": "application/pdf",
        "receivedAt": "2026-08-16T00:00:00Z",
        "scenarioKey": "prompt-injection",
    }
    submit = client.post("/api/invoices", json=body)
    invoice_id = submit.json()["invoiceId"]

    # The module-scoped client shares its DB across every test in this
    # file, so earlier tests may have left other jobs queued — drain until
    # *this* invoice specifically has a decision, not just "up to N jobs".
    from ledgerguard.models import Decision

    with session_scope() as db:
        for _ in range(20):
            if db.query(Decision).filter(Decision.invoice_id == uuid.UUID(invoice_id)).first():
                break
            result = process_next_invoice_job(db)
            if not result["processed"]:
                break

    # prompt-injection lands on exception_review, approved by "controller"
    # (always an authorized role regardless of the invoice's actual route).
    approve_body = {"action": "approved", "actorRole": "controller", "actorName": "Test Reviewer"}
    r1 = client.post(f"/api/invoices/{invoice_id}/actions", json=approve_body)
    assert r1.status_code == 200, r1.json()

    r2 = client.post(f"/api/invoices/{invoice_id}/actions", json=approve_body)
    assert r2.status_code == 409
    assert r2.json()["error"] == "already_resolved"

    with session_scope() as db:
        items = get_queue_items(db)
    item = next(i for i in items if i["invoiceId"] == invoice_id)
    assert item["resolution"] == {"action": "approved", "actorName": "Test Reviewer", "actorRole": "controller"}
