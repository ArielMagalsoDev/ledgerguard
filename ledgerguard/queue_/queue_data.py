"""Real invoices grouped by outcome for /queue."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Decision, Invoice, PurchaseOrder, ReviewAction, Supplier

GROUPS = ("ready_for_approval", "exception_review", "duplicate_hold", "blocked")
TERMINAL_ACTIONS = ("approved", "rejected")


def get_queue_items(db: Session) -> list[dict]:
    invoices = db.scalars(select(Invoice).where(Invoice.status.in_(GROUPS)).order_by(Invoice.created_at.desc())).all()
    items = []
    for inv in invoices:
        decision = db.scalar(select(Decision).where(Decision.invoice_id == inv.id))
        supplier = db.get(Supplier, inv.supplier_id) if inv.supplier_id else None
        po = db.get(PurchaseOrder, inv.purchase_order_id) if inv.purchase_order_id else None
        latest_action = db.scalar(
            select(ReviewAction).where(ReviewAction.invoice_id == inv.id).order_by(ReviewAction.created_at.desc()).limit(1)
        )
        # Once an invoice has a terminal action (approved/rejected), the
        # review form below is retired — matches the API's own 409
        # already_resolved rule (main.py's invoice_action route), so the UI
        # never offers an action the server would reject anyway.
        resolution = (
            {"action": latest_action.action, "actorName": latest_action.actor_name, "actorRole": latest_action.actor_role}
            if latest_action and latest_action.action in TERMINAL_ACTIONS
            else None
        )
        items.append(
            {
                "invoiceId": str(inv.id),
                "invoiceNumber": inv.invoice_number,
                "supplierName": supplier.name if supplier else None,
                "total": str(inv.total) if inv.total is not None else None,
                "outcome": inv.status,
                "reason": decision.reason if decision else "",
                "approvalRoute": decision.approval_route if decision else [],
                "scenarioKey": inv.scenario_key,
                "propertyCode": po.property_code if po else None,
                "propertyName": po.property_code if po else None,
                "resolution": resolution,
            }
        )
    return items


def get_queue_invoices(db: Session, supplier: str | None = None, property_code: str | None = None) -> list[dict]:
    items = get_queue_items(db)
    if supplier:
        items = [i for i in items if i["supplierName"] == supplier]
    if property_code:
        items = [i for i in items if i["propertyCode"] == property_code]
    return items
