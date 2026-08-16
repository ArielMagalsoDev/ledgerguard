"""Latest eval_runs row for /evals — the standard run and the upload-sandbox
run kept separate by run_label prefix, mirroring lib/evals/latest-run.ts and
lib/evals/latest-upload-eval-run.ts."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import EvalRun

UPLOAD_RUN_PREFIX = "upload_sandbox_"


def get_latest_run(db: Session) -> EvalRun | None:
    return db.scalar(
        select(EvalRun)
        .where(~EvalRun.run_label.startswith(UPLOAD_RUN_PREFIX))
        .order_by(EvalRun.run_at.desc())
        .limit(1)
    )


def get_latest_upload_run(db: Session) -> EvalRun | None:
    return db.scalar(
        select(EvalRun).where(EvalRun.run_label.startswith(UPLOAD_RUN_PREFIX)).order_by(EvalRun.run_at.desc()).limit(1)
    )
