"""Remittance bank-detail comparison."""

import re

from ..models import Supplier

_LAST4 = {
    "Acct": re.compile(r"Acct\s+ending\s+(\d{4})", re.I),
    "Routing": re.compile(r"Routing\s+ending\s+(\d{4})", re.I),
}


def _extract_last4(text: str, label: str) -> str | None:
    """Our fixture and demo documents consistently print "Acct ending XXXX" /
    "Routing ending XXXX" — this is a narrow, deliberately simple parser
    scoped to that format, not a general bank-detail OCR parser."""
    m = _LAST4[label].search(text)
    return m.group(1) if m else None


def compare_bank_details(extracted: dict, supplier: Supplier | None) -> dict:
    """Any difference between the invoice's printed remittance details and
    the verified supplier master is treated as critical, regardless of
    amount or how confidently the supplier's identity otherwise matches.
    This function only ever compares; it never writes to the supplier
    master."""
    remittance = extracted.get("remittanceDetails")

    if not supplier or not supplier.bank_name or not supplier.bank_account_last4 or not supplier.bank_routing_last4:
        return {
            "controlId": "bank_detail_change",
            "label": "Remittance bank-detail comparison",
            "status": "not_applicable",
            "severity": "low",
            "reason": (
                "Supplier identity not confirmed, or no bank details on file — bank-detail comparison "
                "requires a known, on-file supplier master to compare against."
            ),
            "evidenceReferences": [],
            "blocking": False,
        }

    if remittance is None or remittance.status != "verified" or not remittance.value:
        return {
            "controlId": "bank_detail_change",
            "label": "Remittance bank-detail comparison",
            "status": "warning",
            "severity": "medium",
            "reason": "Invoice does not print a verifiable remittance block — nothing to compare against the supplier master.",
            "evidenceReferences": ["remittanceDetails"],
            "blocking": False,
        }

    invoice_account_last4 = _extract_last4(remittance.value, "Acct")
    invoice_routing_last4 = _extract_last4(remittance.value, "Routing")

    account_matches = invoice_account_last4 is not None and invoice_account_last4 == supplier.bank_account_last4
    routing_matches = invoice_routing_last4 is not None and invoice_routing_last4 == supplier.bank_routing_last4
    bank_name_matches = supplier.bank_name.lower() in remittance.value.lower()

    if account_matches and routing_matches and bank_name_matches:
        return {
            "controlId": "bank_detail_change",
            "label": "Remittance bank-detail comparison",
            "status": "passed",
            "severity": "low",
            "reason": (
                f"Extracted remittance block ({supplier.bank_name}, acct ending "
                f"{supplier.bank_account_last4}) matches the approved supplier master exactly."
            ),
            "evidenceReferences": ["remittanceDetails"],
            "blocking": True,
        }

    verified_at = supplier.bank_verified_at.isoformat() if supplier.bank_verified_at else "unknown date"
    return {
        "controlId": "bank_detail_change",
        "label": "Remittance bank-detail comparison",
        "status": "failed",
        "severity": "critical",
        "reason": (
            f'Invoice requests remittance to "{remittance.value}" — the approved supplier record on file '
            f"has {supplier.bank_name}, acct ending {supplier.bank_account_last4}, routing ending "
            f"{supplier.bank_routing_last4}, verified {verified_at}. Any difference is treated as "
            "critical regardless of supplier-identity match."
        ),
        "evidenceReferences": ["remittanceDetails"],
        "blocking": True,
    }
