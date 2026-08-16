"""The enforcement point for "no uncertain required monetary field passes
automatically."
"""

REQUIRED_HEADER_FIELDS = [
    "invoiceNumber",
    "invoiceDate",
    "supplierName",
    "supplierTaxId",
    "currency",
    "subtotal",
    "tax",
    "total",
]

REQUIRED_LINE_FIELDS = ["description", "quantity", "unitPrice", "lineTotal"]


def validate_required_fields(extracted: dict) -> tuple[bool, list[str]]:
    """Pure function over already-aligned data; it never itself decides an
    outcome, it only refuses to certify one as clean."""
    problem_fields: list[str] = []

    for key in REQUIRED_HEADER_FIELDS:
        f = extracted.get(key)
        if f is not None and f.status != "verified":
            problem_fields.append(key)

    for line in extracted["lineItems"]:
        for sub in REQUIRED_LINE_FIELDS:
            if line[sub].status != "verified":
                problem_fields.append(f"lineItems[{line['lineNumber']}].{sub}")

    return len(problem_fields) > 0, problem_fields
