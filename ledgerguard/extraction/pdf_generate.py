"""Renders a scenario's document lines to a real one-page PDF with an actual
embedded text layer — this is what makes deterministic evidence alignment
(pdf_text_layer.py) and Claude's native PDF extraction possible at all. Each
document line becomes exactly one PDF text-showing operation, which is what
lets pdf_text_layer.py read it back as one line-level token later."""

from io import BytesIO

from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

PAGE_WIDTH = 612  # US Letter, points
PAGE_HEIGHT = 792
MARGIN_X = 54
LINE_HEIGHT = 16

FONT_SIZE_BY_KIND = {
    "header": 13,
    "meta": 10,
    "table-header": 9,
    "line-item": 10,
    "totals": 10,
    "notes": 10,
    "footer": 8,
}


def _wrap_text(text: str, font_name: str, size: float, max_width: float) -> list[str]:
    if stringWidth(text, font_name, size) <= max_width:
        return [text]

    words = text.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}" if current else word
        if stringWidth(candidate, font_name, size) > max_width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def generate_invoice_pdf(lines: list[dict]) -> bytes:
    """`lines` is a list of {"text": str, "kind": str} dicts (an
    InvoiceDocumentLine's shape)."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(PAGE_WIDTH, PAGE_HEIGHT))
    y = PAGE_HEIGHT - 60

    for line in lines:
        size = FONT_SIZE_BY_KIND[line["kind"]]
        font_name = "Helvetica-Bold" if line["kind"] == "header" else "Helvetica"
        max_width = PAGE_WIDTH - MARGIN_X * 2

        for wrapped in _wrap_text(line["text"], font_name, size, max_width):
            c.setFont(font_name, size)
            c.drawString(MARGIN_X, y, wrapped)
            y -= LINE_HEIGHT

        if line["kind"] in ("header", "table-header"):
            y -= 4  # a little breathing room after section-ish lines

    c.showPage()
    c.save()
    return buffer.getvalue()
