"""Recomputes every arithmetic relationship in the invoice using integer-cent
math — never trusting the printed figures."""

from ..money import add_cents, cents_diff, cents_to_decimal_string, parse_decimal_to_cents


def compute_arithmetic_controls(extracted: dict, tax_rounding_tolerance_usd: float) -> list[dict]:
    """A line whose quantity/unitPrice/lineTotal isn't independently verified
    against the document cannot be arithmetic-checked at all — that's
    reported as its own failed, blocking control rather than silently
    skipped, which is what actually enforces "no uncertain required monetary
    field passes automatically."""
    controls: list[dict] = []
    tolerance_cents = round(tax_rounding_tolerance_usd * 100)

    # --- Line-total recalculation ---
    line_cents: list[int | None] = []
    line_issues: list[str] = []

    for li in extracted["lineItems"]:
        unresolved = (
            li["quantity"].status != "verified"
            or li["unitPrice"].status != "verified"
            or li["lineTotal"].status != "verified"
        )

        if unresolved:
            line_cents.append(None)
            desc = li["description"].value or "unknown"
            line_issues.append(
                f"Line {li['lineNumber']} ({desc}): quantity, unit price, or line total could not be "
                "independently verified against the document — cannot recompute."
            )
            continue

        try:
            qty = float(li["quantity"].value)
        except (TypeError, ValueError):
            qty = None
        unit_cents = parse_decimal_to_cents(li["unitPrice"].value)
        printed_line_cents = parse_decimal_to_cents(li["lineTotal"].value)

        if qty is None or unit_cents is None or printed_line_cents is None:
            line_cents.append(None)
            line_issues.append(f"Line {li['lineNumber']}: quantity, unit price, or line total is not a valid number.")
            continue

        computed_line_cents = round(qty * unit_cents)
        line_cents.append(printed_line_cents)

        if cents_diff(computed_line_cents, printed_line_cents) > 1:
            line_issues.append(
                f"Line {li['lineNumber']} ({li['description'].value}): {qty} × "
                f"${li['unitPrice'].value} = ${cents_to_decimal_string(computed_line_cents)}, but the "
                f"printed line total is ${li['lineTotal'].value}."
            )

    controls.append(
        {
            "controlId": "arithmetic_line_totals",
            "label": "Line-total recalculation",
            "status": "passed" if not line_issues else "failed",
            "severity": "low" if not line_issues else "high",
            "reason": (
                f"All {len(extracted['lineItems'])} line total(s) recompute exactly from quantity × unit price."
                if not line_issues
                else " ".join(line_issues)
            ),
            "evidenceReferences": ["lineItems"],
            "blocking": True,
        }
    )

    # --- Subtotal recalculation ---
    all_lines_resolved = all(c is not None for c in line_cents)
    summed_line_cents = add_cents(*[c for c in line_cents if c is not None]) if all_lines_resolved else None
    printed_subtotal_cents = (
        parse_decimal_to_cents(extracted["subtotal"].value) if extracted["subtotal"].status == "verified" else None
    )

    subtotal_status = "failed"
    if not all_lines_resolved:
        subtotal_reason = "Cannot recompute the subtotal — one or more line totals were not independently verified."
    elif printed_subtotal_cents is None:
        subtotal_reason = "Subtotal field is not a verified, valid monetary value — cannot check against line totals."
    elif cents_diff(summed_line_cents, printed_subtotal_cents) <= 1:
        subtotal_status = "passed"
        subtotal_reason = f"Sum of line totals equals the printed subtotal of ${extracted['subtotal'].value}."
    else:
        subtotal_reason = (
            f"Sum of line totals is ${cents_to_decimal_string(summed_line_cents)}, but the printed "
            f"subtotal is ${extracted['subtotal'].value}."
        )

    controls.append(
        {
            "controlId": "arithmetic_subtotal",
            "label": "Subtotal recalculation",
            "status": subtotal_status,
            "severity": "low" if subtotal_status == "passed" else "high",
            "reason": subtotal_reason,
            "evidenceReferences": ["subtotal"],
            "blocking": True,
        }
    )

    # --- Tax and grand-total recalculation ---
    tax_cents = parse_decimal_to_cents(extracted["tax"].value) if extracted["tax"].status == "verified" else None
    total_cents = parse_decimal_to_cents(extracted["total"].value) if extracted["total"].status == "verified" else None

    tax_status = "failed"
    if printed_subtotal_cents is None or tax_cents is None or total_cents is None:
        tax_reason = "Subtotal, tax, or total is not a verified, valid monetary value — cannot recompute."
    else:
        computed_total_cents = add_cents(printed_subtotal_cents, tax_cents)
        diff = cents_diff(computed_total_cents, total_cents)
        if diff <= tolerance_cents:
            tax_status = "passed"
            if diff == 0:
                tax_reason = f"Subtotal + tax equals the printed total of ${extracted['total'].value} exactly."
            else:
                tax_reason = (
                    f"Subtotal + tax = ${cents_to_decimal_string(computed_total_cents)}; printed total is "
                    f"${extracted['total'].value} — ${cents_to_decimal_string(diff)} difference, within the "
                    f"${tax_rounding_tolerance_usd:.2f} rounding tolerance."
                )
        else:
            tax_reason = (
                f"Subtotal (${extracted['subtotal'].value}) + tax (${extracted['tax'].value}) = "
                f"${cents_to_decimal_string(computed_total_cents)}, but the printed total is "
                f"${extracted['total'].value} — exceeds the ${tax_rounding_tolerance_usd:.2f} rounding tolerance."
            )

    controls.append(
        {
            "controlId": "arithmetic_tax_total",
            "label": "Tax and grand-total recalculation",
            "status": tax_status,
            "severity": "low" if tax_status == "passed" else "high",
            "reason": tax_reason,
            "evidenceReferences": ["tax", "total"],
            "blocking": True,
        }
    )

    return controls
