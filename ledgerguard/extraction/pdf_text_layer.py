"""Reads the real text layer out of a PDF — page, string, and position for
every line-level text-showing operation. This is the deterministic ground
truth that align_evidence.py checks extracted values against. The model
never gets to report its own coordinates.

Reads the text layer with pdfplumber. `extract_text_lines()` clusters
characters into lines by layout, which matches the document's own
text-showing operations because pdf_generate.py draws exactly one operation
per document line — and pdfplumber's box coordinates are top-left-origin, so
dividing by page width/height yields normalized coordinates directly, with
no y-axis flip needed.
"""

import io
from dataclasses import dataclass

import pdfplumber


@dataclass
class TextLayerLine:
    page: int  # 1-based
    text: str
    box: tuple[float, float, float, float]  # (x0, y0, x1, y1), normalized 0-1, top-left origin


def _clamp01(n: float) -> float:
    return min(1.0, max(0.0, n))


def extract_text_layer(pdf_bytes: bytes) -> list[TextLayerLine]:
    lines: list[TextLayerLine] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            width, height = page.width, page.height
            if width <= 0 or height <= 0:
                continue
            for raw_line in page.extract_text_lines(strip=True, return_chars=False):
                text = raw_line.get("text", "")
                if not text.strip():
                    continue
                x0 = _clamp01(raw_line["x0"] / width)
                x1 = _clamp01(raw_line["x1"] / width)
                y0 = _clamp01(raw_line["top"] / height)
                y1 = _clamp01(raw_line["bottom"] / height)
                lines.append(TextLayerLine(page=page_num, text=text, box=(x0, y0, x1, y1)))
    return lines


def count_text_items_per_page(pdf_bytes: bytes) -> list[int]:
    """Used by the upload sandbox's text-density check — a low count means a
    scanned image with no real text layer, which this app rejects rather
    than OCRing."""
    counts: list[int] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            counts.append(len(page.extract_words()))
    return counts
