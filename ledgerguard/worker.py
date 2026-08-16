"""Durable worker process: claims and runs queued `process_invoice` jobs in
a loop."""

import time

from .db import init_db, session_scope
from .seed import seed_all
from .workflow.process_invoice_job import process_next_invoice_job


def run_once() -> bool:
    with session_scope() as db:
        return process_next_invoice_job(db)["processed"]


def main() -> None:
    init_db()
    with session_scope() as db:
        seed_all(db)
    while True:
        if not run_once():
            time.sleep(1)


if __name__ == "__main__":
    main()
