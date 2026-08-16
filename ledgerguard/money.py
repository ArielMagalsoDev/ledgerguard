"""Decimal-safe money handling. Never Python floats for currency math —
everything here operates in integer cents."""

import re

_DECIMAL_STRING = re.compile(r"^-?\d+(\.\d{1,2})?$")


def parse_decimal_to_cents(value: str | None) -> int | None:
    """Parses a decimal string ("842.40", "0", "-12.5") into integer cents.
    Returns None for anything that isn't a strict decimal string — no
    coercion, no locale parsing, no stripping of currency symbols."""
    if value is None:
        return None
    trimmed = value.strip()
    if not _DECIMAL_STRING.match(trimmed):
        return None

    negative = trimmed.startswith("-")
    unsigned = trimmed[1:] if negative else trimmed
    parts = unsigned.split(".", 1)
    whole_part = parts[0]
    fraction_part = parts[1] if len(parts) > 1 else ""
    cents = int(whole_part) * 100 + int(fraction_part.ljust(2, "0"))
    return -cents if negative else cents


def cents_to_decimal_string(cents: int) -> str:
    negative = cents < 0
    abs_cents = abs(round(cents))
    whole_part = abs_cents // 100
    fraction_part = str(abs_cents % 100).rjust(2, "0")
    return f"{'-' if negative else ''}{whole_part}.{fraction_part}"


def add_cents(*values: int) -> int:
    return sum(values)


def cents_diff(a: int, b: int) -> int:
    return abs(a - b)
