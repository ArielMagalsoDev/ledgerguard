"""Aligns raw extracted fields against the real document text layer — the
hallucination guard."""

import re
from dataclasses import dataclass, field

from .pdf_text_layer import TextLayerLine


@dataclass
class Haystack:
    text: str
    page: int
    box: tuple[float, float, float, float]


@dataclass
class Evidence:
    page: int
    text: str
    bounding_box: tuple[float, float, float, float]


@dataclass
class ExtractedFieldValue:
    field: str
    value: str | None
    normalized_value: str | None = None
    confidence: float = 0.0
    status: str = "missing"  # verified | uncertain | conflicting | missing
    evidence: list[Evidence] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "field": self.field,
            "value": self.value,
            "normalizedValue": self.normalized_value,
            "confidence": self.confidence,
            "status": self.status,
            "evidence": [
                {"page": e.page, "text": e.text, "boundingBox": list(e.bounding_box)} for e in self.evidence
            ],
        }


_WHITESPACE = re.compile(r"\s+")


def _union_box(a: tuple[float, float, float, float], b: tuple[float, float, float, float]):
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def _normalize_whitespace(s: str) -> str:
    return _WHITESPACE.sub(" ", s).strip()


def _build_haystacks(text_layer: list[TextLayerLine]) -> tuple[list[Haystack], list[Haystack]]:
    """Two search tiers: individual text-layer lines, and consecutive
    same-page pairs concatenated. Pairs exist only to recover a quote that
    fell across a PDF line-wrap boundary — they must stay a strict fallback,
    searched only when no single line matches."""
    singles = [Haystack(text=l.text, page=l.page, box=l.box) for l in text_layer]
    pairs: list[Haystack] = []
    for i in range(len(text_layer) - 1):
        a, b = text_layer[i], text_layer[i + 1]
        if a.page != b.page:
            continue
        pairs.append(Haystack(text=f"{a.text} {b.text}", page=a.page, box=_union_box(a.box, b.box)))
    return singles, pairs


def _value_appears_in_quote(value: str, quote: str) -> bool:
    """If the model's own value isn't even present in its own quote, the
    quote cannot be real evidence for it, independent of whether it's found
    in the document at all."""

    def strip(s: str) -> str:
        return s.replace(",", "").replace("$", "")

    return strip(value) in strip(quote)


def _search_tier(quote: str, haystacks: list[Haystack]) -> list[Haystack]:
    exact = [h for h in haystacks if quote in h.text]
    if exact:
        return exact
    lower_quote = quote.lower()
    case_insensitive = [h for h in haystacks if lower_quote in h.text.lower()]
    if case_insensitive:
        return case_insensitive
    normalized_quote = _normalize_whitespace(quote)
    return [h for h in haystacks if normalized_quote in _normalize_whitespace(h.text)]


def _find_matches(quote: str, singles: list[Haystack], pairs: list[Haystack]) -> list[Haystack]:
    single_matches = _search_tier(quote, singles)
    if single_matches:
        return single_matches
    return _search_tier(quote, pairs)


def align_field(
    raw: dict,
    field_name: str,
    singles: list[Haystack],
    pairs: list[Haystack],
    normalize=None,
) -> ExtractedFieldValue:
    value = raw.get("value")
    quote = raw.get("quote")

    if value is None:
        return ExtractedFieldValue(field=field_name, value=None, confidence=0, status="missing", evidence=[])

    if quote is None or not _value_appears_in_quote(value, quote):
        return ExtractedFieldValue(
            field=field_name,
            value=value,
            normalized_value=normalize(value) if normalize else None,
            confidence=0.3,
            status="uncertain",
            evidence=[],
        )

    matches = _find_matches(quote, singles, pairs)

    if not matches:
        return ExtractedFieldValue(
            field=field_name,
            value=value,
            normalized_value=normalize(value) if normalize else None,
            confidence=0.35,
            status="uncertain",
            evidence=[],
        )

    unique_boxes = {",".join(str(c) for c in m.box) for m in matches}
    status = "conflicting" if len(unique_boxes) > 1 else "verified"
    take = len(matches) if len(unique_boxes) > 1 else 1

    return ExtractedFieldValue(
        field=field_name,
        value=value,
        normalized_value=normalize(value) if normalize else None,
        confidence=0.97 if status == "verified" else 0.5,
        status=status,
        evidence=[Evidence(page=m.page, text=quote, bounding_box=m.box) for m in matches[:take]],
    )


def _normalize_alnum(v: str) -> str:
    return re.sub(r"[^0-9A-Z]", "", v.upper())


def align_extraction(raw: dict, text_layer: list[TextLayerLine]) -> dict:
    singles, pairs = _build_haystacks(text_layer)

    def f(raw_field: dict, name: str, normalize=None) -> ExtractedFieldValue:
        return align_field(raw_field, name, singles, pairs, normalize)

    line_items = []
    for li in raw["lineItems"]:
        line_items.append(
            {
                "lineNumber": li["lineNumber"],
                "description": f(li["description"], "description"),
                "quantity": f(li["quantity"], "quantity"),
                "unitPrice": f(li["unitPrice"], "unitPrice"),
                "lineTotal": f(li["lineTotal"], "lineTotal"),
            }
        )

    return {
        "invoiceNumber": f(raw["invoiceNumber"], "invoiceNumber", _normalize_alnum),
        "invoiceDate": f(raw["invoiceDate"], "invoiceDate"),
        "dueDate": f(raw["dueDate"], "dueDate"),
        "supplierName": f(raw["supplierName"], "supplierName"),
        "supplierTaxId": f(raw["supplierTaxId"], "supplierTaxId", _normalize_alnum),
        "purchaseOrderNumber": f(raw["purchaseOrderNumber"], "purchaseOrderNumber", _normalize_alnum),
        "currency": f(raw["currency"], "currency"),
        "subtotal": f(raw["subtotal"], "subtotal"),
        "tax": f(raw["tax"], "tax"),
        "total": f(raw["total"], "total"),
        "remittanceDetails": f(raw["remittanceDetails"], "remittanceDetails"),
        "notes": f(raw["notes"], "notes"),
        "lineItems": line_items,
    }


def extracted_to_dict(extracted: dict) -> dict:
    """Converts an align_extraction() result (ExtractedFieldValue objects,
    the shape every matching/*.py function expects via attribute access)
    into a plain JSON-safe dict — the shape the `invoices.extracted` column
    and templates expect, matching fixtures/scenarios.py's static shape."""

    def convert(v):
        return v.to_dict() if isinstance(v, ExtractedFieldValue) else v

    return {
        **{k: convert(v) for k, v in extracted.items() if k != "lineItems"},
        "lineItems": [{k: convert(v) for k, v in li.items()} for li in extracted["lineItems"]],
    }
