"""Sums received quantity per line description across every receipt on file
for a PO."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Receipt, ReceiptLine


def _normalize_description(s: str) -> str:
    return s.lower().strip()


def match_receipts(db: Session, purchase_order_id: str) -> dict:
    """Returns {"receipt_ids": [...], "received_quantity_by_description": {...}}
    — the evidence PO tolerance checks consult before allowing a quantity
    over the PO-approved amount ("quantity tolerance: zero unless a receipt
    records the additional quantity")."""
    receipts = db.scalars(select(Receipt).where(Receipt.purchase_order_id == purchase_order_id)).all()

    received_quantity_by_description: dict[str, float] = {}
    receipt_ids: list[str] = []

    for receipt in receipts:
        receipt_ids.append(receipt.id)
        lines = db.scalars(select(ReceiptLine).where(ReceiptLine.receipt_id == receipt.id)).all()
        for line in lines:
            key = _normalize_description(line.description)
            received_quantity_by_description[key] = received_quantity_by_description.get(key, 0) + float(
                line.quantity_received
            )

    return {"receipt_ids": receipt_ids, "received_quantity_by_description": received_quantity_by_description}
