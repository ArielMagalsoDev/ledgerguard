"""Approval routing + cost-center guessing."""

import re

from .policy import PolicyConfig, approver_role_for_amount

COST_CENTER_RULES: list[dict] = [
    {"keywords": re.compile(r"clean|janitor|pest", re.I), "cost_center": "CC-FAC-CLEAN", "account_code": "6120-SUPPLIES"},
    {
        "keywords": re.compile(r"hvac|mechanical|compressor|refrigerant", re.I),
        "cost_center": "CC-FAC-MECH",
        "account_code": "6130-MAINTENANCE",
    },
    {"keywords": re.compile(r"security|patrol|guard", re.I), "cost_center": "CC-FAC-SEC", "account_code": "6140-SECURITY"},
    {
        "keywords": re.compile(r"ground|landscap|mow|mulch|irrigation", re.I),
        "cost_center": "CC-FAC-GRND",
        "account_code": "6150-GROUNDS",
    },
]


def compute_approval_route(outcome: str, total_usd: float, policy: PolicyConfig) -> list[str]:
    """An exception never routes to a cheaper approver than a clean invoice of
    the same amount would get — it routes to that same band PLUS AP.
    Duplicate holds get no approval task at all. Blocked invoices bypass the
    amount bands entirely — bank-detail and identity failures escalate
    straight to AP + Controller regardless of amount."""
    if outcome == "ready_for_approval":
        return [approver_role_for_amount(policy, total_usd)]
    if outcome == "exception_review":
        return [approver_role_for_amount(policy, total_usd), "ap_review_team"]
    if outcome == "duplicate_hold":
        return []
    if outcome == "blocked":
        return ["ap_review_team", "controller"]
    return []


def guess_cost_center(supplier_name: str, line_descriptions: list[str]) -> dict:
    """Lightweight keyword heuristic — there's no supplier-to-cost-center
    mapping in the schema, so this infers from supplier name and line
    descriptions."""
    haystack = " ".join([supplier_name, *line_descriptions])
    for rule in COST_CENTER_RULES:
        if rule["keywords"].search(haystack):
            return {"cost_center": rule["cost_center"], "account_code": rule["account_code"]}
    return {"cost_center": "CC-FAC-CLEAN", "account_code": "6120-SUPPLIES"}
