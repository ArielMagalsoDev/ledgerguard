"""Local-disk PDF storage.
Three prefixes: demo-scenarios/<scenarioId>.pdf, eval-cases/<caseId>.pdf,
uploads/<sessionToken>/<sha256>.pdf — under PDF_STORAGE_DIR (a Docker volume
in production)."""

from pathlib import Path

from .config import settings


def _root() -> Path:
    root = Path(settings().pdf_storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_pdf(storage_path: str, data: bytes) -> None:
    path = _root() / storage_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def load_pdf(storage_path: str) -> bytes:
    path = _root() / storage_path
    return path.read_bytes()


def delete_pdf(storage_path: str) -> None:
    path = _root() / storage_path
    path.unlink(missing_ok=True)
