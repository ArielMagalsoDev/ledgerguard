"""Upload sandbox — public-boundary file validation. Runs entirely before
any model call: rejecting bad input here is what keeps the daily spend cap
and the extraction pipeline from ever seeing a hostile or useless file."""

import io
import re
from dataclasses import dataclass

import pypdf

from ..config import settings
from ..extraction.pdf_text_layer import extract_text_layer

MAX_FILENAME_LENGTH = 255  # conventional filesystem limit; also keeps a hostile filename out of the DB and UI
# A born-digital invoice PDF has dozens of short text items per page (every
# word/number is its own item). A scanned PDF with no embedded text layer
# has zero. This threshold is deliberately low — it exists to separate "has
# a real text layer" from "doesn't", not to judge extraction quality.
MIN_TEXT_ITEMS_PER_PAGE = 5

# Raw-byte scan for PDF directives that can carry active content — "never
# render active content" promise. Best-effort keyword scan, not a real PDF
# parser walking the object graph — a determined attacker could hide these
# inside a compressed object stream and slip past a raw scan. Honest scope:
# a cheap first filter, not a substitute for the browser's own PDF-viewer
# sandboxing (the real backstop).
_DANGEROUS_PDF_PATTERNS = [
    re.compile(rb"/JavaScript\b"),
    re.compile(rb"/JS\b"),
    re.compile(rb"/OpenAction\b"),
    re.compile(rb"/AA\b"),  # additional-actions dictionary (auto-run on open/close/print)
    re.compile(rb"/Launch\b"),
    re.compile(rb"/EmbeddedFile\b"),
    re.compile(rb"/RichMedia\b"),
    re.compile(rb"/XFA\b"),  # XML forms — has its own scripting model
]

ERROR_MESSAGES = {
    "file_too_large": f"File exceeds the {settings().max_upload_bytes // (1024 * 1024)} MB limit for the upload sandbox.",
    "filename_too_long": f"The file name is too long (over {MAX_FILENAME_LENGTH} characters). Rename the file and try again.",
    "not_a_pdf": "This doesn't look like a PDF — the file's own bytes don't start with the PDF signature, regardless of its filename or extension.",
    "active_content": (
        "This PDF contains embedded scripting, launch, or auto-run directives, which the upload sandbox "
        'rejects outright regardless of what they do. Re-export the invoice as a plain PDF (e.g. "Print to '
        'PDF") and try again.'
    ),
    "encrypted_pdf": "This PDF is password-protected or encrypted. The upload sandbox can't open it.",
    "malformed_pdf": "This PDF couldn't be parsed — it may be corrupted or use a format LedgerGuard's demo doesn't support.",
    "too_many_pages": f"This PDF has more than {settings().max_pdf_pages} pages. The upload sandbox is scoped to short invoices.",
    "no_text_layer": (
        "This looks like a scanned or image-based document. LedgerGuard's public demo verifies every "
        "extracted value against the PDF's embedded text layer, and this file doesn't have one. OCR "
        "support is on the roadmap — try one of the seeded scenarios instead, or upload a digitally-generated "
        "PDF invoice."
    ),
}


@dataclass
class UploadValidationResult:
    ok: bool
    page_count: int | None = None
    error: str | None = None
    message: str | None = None


def _fail(error: str) -> UploadValidationResult:
    return UploadValidationResult(ok=False, error=error, message=ERROR_MESSAGES[error])


def validate_upload(data: bytes, original_file_name: str | None = None) -> UploadValidationResult:
    """Full validation chain, in order: filename shape → size → real magic
    bytes (never trust the filename or browser-reported MIME type) →
    active-content scan → parseable and unencrypted → page count →
    text-layer density. Every check runs before this function returns, so a
    caller only ever sees one of: an accepted result with the page count, or
    the single most relevant rejection reason."""
    if original_file_name and len(original_file_name) > MAX_FILENAME_LENGTH:
        return _fail("filename_too_long")

    if len(data) == 0 or len(data) > settings().max_upload_bytes:
        return _fail("file_too_large")

    # Real magic-byte check — "%PDF-" — not a browser-reported MIME type,
    # which is attacker-controlled and just an extension-based guess.
    if data[:5] != b"%PDF-":
        return _fail("not_a_pdf")

    # Best-effort scan for active-content directives — runs on the raw bytes
    # before we spend any effort parsing, independent of whether the file
    # can even be opened (rejecting outright is correct regardless).
    if any(pattern.search(data) for pattern in _DANGEROUS_PDF_PATTERNS):
        return _fail("active_content")

    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            return _fail("encrypted_pdf")
        page_count = len(reader.pages)
    except pypdf.errors.FileNotDecryptedError:
        return _fail("encrypted_pdf")
    except Exception:  # noqa: BLE001 — any parse failure is a malformed PDF from the caller's perspective
        return _fail("malformed_pdf")

    if page_count > settings().max_pdf_pages:
        return _fail("too_many_pages")

    # Text-layer density: reuse the exact deterministic reader the
    # extraction pipeline itself relies on — if that finds nothing real for
    # this file, extraction and evidence alignment wouldn't either.
    try:
        lines = extract_text_layer(data)
        text_item_count = len(lines)
    except Exception:  # noqa: BLE001
        return _fail("malformed_pdf")

    if text_item_count < MIN_TEXT_ITEMS_PER_PAGE * page_count:
        return _fail("no_text_layer")

    return UploadValidationResult(ok=True, page_count=page_count)
