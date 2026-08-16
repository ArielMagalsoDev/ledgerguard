"""Submits the 5 guided demo scenarios as demo_scenario invoices and drains
the worker queue until each has a decision — keeps a standing "live"
instance of each scenario for /demo and /queue.

    python -m ledgerguard.run_demo_pipeline
"""

import sys
from datetime import UTC, datetime

from .db import init_db, session_scope
from .extraction.pdf_generate import generate_invoice_pdf
from .fixtures.scenarios import SCENARIOS
from .seed import seed_all
from .storage import save_pdf
from .workflow.process_invoice_job import process_next_invoice_job
from .workflow.submit_invoice import Submission, submit_invoice


def main() -> None:
    init_db()
    with session_scope() as db:
        seed_all(db)

        submitted_ids = []
        for scenario in SCENARIOS:
            pdf_bytes = generate_invoice_pdf(scenario["documentLines"])
            storage_path = f"demo-scenarios/{scenario['id']}.pdf"
            save_pdf(storage_path, pdf_bytes)

            submission = scenario["submission"]
            result = submit_invoice(
                db,
                Submission(
                    submission_id=submission["submissionId"],
                    source="demo_scenario",
                    original_file_name=submission["originalFileName"],
                    file_hash=submission["fileHash"],
                    mime_type=submission["mimeType"],
                    received_at=datetime.now(UTC),
                    sender_email=submission.get("senderEmail"),
                    scenario_key=scenario["id"],
                ),
                storage_path,
            )
            submitted_ids.append(result.invoice_id)
            print(f"  submitted {scenario['id']} -> invoice {result.invoice_id} (replay={result.is_replay})")

        print("\nDraining the job queue...")
        drained = 0
        while True:
            job_result = process_next_invoice_job(db)
            if not job_result["processed"]:
                break
            drained += 1
            outcome = job_result.get("outcome") or job_result.get("error")
            print(f"  processed invoice {job_result['invoice_id']} -> {outcome}")

        print(f"\nDone. {drained} job(s) processed, {len(submitted_ids)} scenario(s) submitted.")


if __name__ == "__main__":
    sys.exit(main() or 0)
