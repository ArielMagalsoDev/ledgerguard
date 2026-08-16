"""Outcome metadata — label/short-label/color/background/description per
decision outcome.

Registered as a Jinja global in main.py (`templates.env.globals["OUTCOME_META"]
= OUTCOME_META`) so every template — not just the ones that receive it
explicitly in their route's context — can read it. That's what lets
partials/outcome_badge.html (shared across /demo, /queue, /operations) look
it up without each route threading it through by hand.
"""

OUTCOME_META: dict[str, dict[str, str]] = {
    "ready_for_approval": {
        "label": "Ready for approval",
        "short": "Ready",
        "color": "var(--ready)",
        "bg": "var(--ready-bg)",
        "description": "Extraction complete, arithmetic valid, supplier and PO match, no duplicate, tolerances pass.",
    },
    "exception_review": {
        "label": "Exception review",
        "short": "Exception",
        "color": "var(--exception)",
        "bg": "var(--exception-bg)",
        "description": "Legitimate-looking invoice with a price, quantity, tax, receipt, or documentation exception.",
    },
    "duplicate_hold": {
        "label": "Duplicate hold",
        "short": "Duplicate",
        "color": "var(--duplicate)",
        "bg": "var(--duplicate-bg)",
        "description": "Exact or probable duplicate evidence — requires AP investigation before anything else happens.",
    },
    "blocked": {
        "label": "Blocked",
        "short": "Blocked",
        "color": "var(--blocked)",
        "bg": "var(--blocked-bg)",
        "description": "Supplier identity, bank details, file safety, or required fields fail a high-risk control.",
    },
}
