"""Supplier identity resolution."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Supplier


def resolve_supplier(db: Session, extracted: dict) -> dict:
    """Tax ID first, always. Name is a candidate signal only — even a
    perfect name-similarity score never auto-promotes past "probable". New
    suppliers are never created here.

    Returns {"supplier_id", "supplier" (Supplier | None), "tier", "control"}.
    """
    tax_id_field = extracted["supplierTaxId"]

    if tax_id_field.status == "verified" and tax_id_field.normalized_value:
        exact = db.scalar(select(Supplier).where(Supplier.tax_id_normalized == tax_id_field.normalized_value))
        if exact:
            approved = exact.status == "approved"
            return {
                "supplier_id": exact.id,
                "supplier": exact,
                "tier": "exact",
                "control": {
                    "controlId": "supplier_identity",
                    "label": "Supplier identity match",
                    "status": "passed" if approved else "failed",
                    "severity": "low" if approved else "critical",
                    "reason": (
                        f"Tax ID {tax_id_field.value} matches the approved {exact.name} record exactly."
                        if approved
                        else f'Tax ID {tax_id_field.value} matches {exact.name}, but that supplier\'s status is "{exact.status}", not approved.'
                    ),
                    "evidenceReferences": ["supplierTaxId"],
                    "blocking": True,
                },
            }

    # No exact tax-ID match — fall back to normalized name as a candidate
    # signal only. Multiple candidates, or a name-only hit, never resolve
    # past "probable"/"ambiguous" — this function alone never confirms identity.
    name_field = extracted["supplierName"]
    if name_field.status == "verified" and name_field.value:
        needle = name_field.value.strip().lower()
        candidates = db.scalars(select(Supplier)).all()
        matches = [s for s in candidates if needle in s.name.lower()]

        if len(matches) == 1:
            return {
                "supplier_id": None,
                "supplier": None,
                "tier": "probable",
                "control": {
                    "controlId": "supplier_identity",
                    "label": "Supplier identity match",
                    "status": "warning",
                    "severity": "high",
                    "reason": (
                        f'Tax ID did not match any approved supplier. Supplier name resembles "{matches[0].name}" '
                        "on file, but a name match alone is never treated as confirmed identity — requires human confirmation."
                    ),
                    "evidenceReferences": ["supplierName"],
                    "blocking": True,
                },
            }

        if len(matches) > 1:
            return {
                "supplier_id": None,
                "supplier": None,
                "tier": "ambiguous",
                "control": {
                    "controlId": "supplier_identity",
                    "label": "Supplier identity match",
                    "status": "failed",
                    "severity": "high",
                    "reason": (
                        f"Supplier name matches {len(matches)} approved suppliers by name alone, with no "
                        "tax-ID match to disambiguate. Requires human review before any automatic routing."
                    ),
                    "evidenceReferences": ["supplierName"],
                    "blocking": True,
                },
            }

    return {
        "supplier_id": None,
        "supplier": None,
        "tier": "none",
        "control": {
            "controlId": "supplier_identity",
            "label": "Supplier identity match",
            "status": "failed",
            "severity": "critical",
            "reason": "No approved supplier matches this invoice's tax ID or name. New suppliers are never created automatically.",
            "evidenceReferences": ["supplierTaxId", "supplierName"],
            "blocking": True,
        },
    }
