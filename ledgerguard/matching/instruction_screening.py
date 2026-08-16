"""Deterministic pattern check for instruction-shaped content in untrusted
free text. This is a visibility flag only: it never blocks, never changes
any other control's result, and never touches supplier or decision data."""

import re

INSTRUCTION_PATTERNS = [
    re.compile(r"system\s+notice", re.I),
    re.compile(r"pre-?approved", re.I),
    re.compile(r"skip[\w\s]*(matching|verification|review)", re.I),
    re.compile(r"mark\s+(this\s+)?invoice\s+(as\s+)?ready", re.I),
    re.compile(r"update\s+(the\s+)?remittance", re.I),
    re.compile(r"ignore\s+(the\s+)?(previous|prior|all)\s+instructions?", re.I),
    re.compile(r"disregard\s+(the\s+)?(previous|prior)", re.I),
    re.compile(r"do\s+not\s+(verify|check|review)", re.I),
    re.compile(r"automatically\s+approve", re.I),
]


def _passed() -> dict:
    return {
        "controlId": "source_screening",
        "label": "Embedded-instruction screening",
        "status": "passed",
        "severity": "low",
        "reason": "No instruction-shaped content detected in extracted text fields.",
        "evidenceReferences": [],
        "blocking": False,
    }


def screen_instructions(extracted: dict) -> dict:
    notes = extracted.get("notes")
    if not notes or notes.value is None or notes.status == "missing":
        return _passed()

    text = notes.value
    matched = next((p for p in INSTRUCTION_PATTERNS if p.search(text)), None)

    if matched:
        snippet = f"{text[:120]}..." if len(text) > 120 else text
        return {
            "controlId": "source_screening",
            "label": "Embedded-instruction screening",
            "status": "warning",
            "severity": "high",
            "reason": (
                f'Instruction-shaped content detected in the invoice notes ("{snippet}"). Treated as '
                "untrusted text — ignored by every downstream control and never used to change a "
                "decision, a status, or supplier data."
            ),
            "evidenceReferences": ["notes"],
            "blocking": False,
        }

    return _passed()
