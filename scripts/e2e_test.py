"""Phase 3 E2E check — SQLite in-memory DB, seeded, run each of the 5
scenarios through extract() + decide_invoice() and confirm the outcome
matches the scenario's labeled outcome."""

import sys
import uuid

sys.path.insert(0, ".")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from ledgerguard import seed
from ledgerguard.db import Base
from ledgerguard.extraction.extract import extract_invoice
from ledgerguard.extraction.pdf_generate import generate_invoice_pdf
from ledgerguard.fixtures.scenarios import SCENARIOS
from ledgerguard.matching.decide import decide_invoice
from ledgerguard.policy import DEFAULT_POLICY

engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)
Session = sessionmaker(engine)

db = Session()
seed.seed_all(db)

failures = 0
for scenario in SCENARIOS:
    pdf_bytes = generate_invoice_pdf(scenario["documentLines"])
    result = extract_invoice(pdf_bytes, 0.02)
    fake_invoice_id = uuid.uuid4()
    decision_result = decide_invoice(
        db, fake_invoice_id, "wf_test", result.extracted, result.arithmetic_controls,
        result.requires_review, result.problem_fields, "policy_2026.3", DEFAULT_POLICY,
    )
    outcome = decision_result["decision"]["outcome"]
    expected = scenario["outcome"]
    ok = outcome == expected
    if not ok:
        failures += 1
    print(f"{scenario['id']:28s} expected={expected:20s} got={outcome:20s} {'OK' if ok else 'MISMATCH'}")
    if not ok:
        print(f"  reason: {decision_result['decision']['reason']}")
        for c in decision_result["new_controls"]:
            print(f"  control {c['controlId']:26s} {c['status']:14s} {c['reason'][:100]}")

print(f"\nTOTAL FAILURES: {failures}")
sys.exit(1 if failures else 0)
