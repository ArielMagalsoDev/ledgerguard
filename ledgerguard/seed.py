"""Seeds the fictional Keystone Facilities Group AP master data — suppliers,
properties, purchase orders, receipts, cost centers, approvers, 24 historical
invoices (duplicate-detection ground truth), and the active policy row.
Idempotent — safe to call on every startup.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import POLICY_VERSION
from .models import (
    Approver,
    CostCenter,
    ExistingInvoice,
    Policy,
    PoLine,
    Property,
    PurchaseOrder,
    Receipt,
    ReceiptLine,
    Supplier,
)
from .policy import DEFAULT_POLICY, policy_config_to_dict

SEED_SUPPLIERS = [
    {
        "id": "sup_apc",
        "name": "Anchor Point Pest Control",
        "tax_id": "29-8801145",
        "approved_domain": "anchorpointpest.example",
        "bank_name": "Anchor Point Pest Control",
        "bank_account_last4": "5510",
        "bank_routing_last4": "1188",
        "bank_verified_at": date(2025, 4, 20),
    },
    {
        "id": "sup_aps",
        "name": "Atlas Parking Systems",
        "tax_id": "93-4402718",
        "approved_domain": "atlasparking.example",
        "bank_name": "Crestline Commercial Bank",
        "bank_account_last4": "1156",
        "bank_routing_last4": "0056",
        "bank_verified_at": date(2025, 10, 5),
    },
    {
        "id": "sup_bjs",
        "name": "Brightway Janitorial Supply",
        "tax_id": "47-1122334",
        "approved_domain": "brightwayjanitorial.example",
        "bank_name": "First Continental Bank",
        "bank_account_last4": "2231",
        "bank_routing_last4": "0044",
        "bank_verified_at": date(2025, 9, 2),
    },
    {
        "id": "sup_css",
        "name": "Coastal Sentinel Security Services",
        "tax_id": "55-4471902",
        "approved_domain": "coastalsentinel.example",
        "bank_name": "First Continental Bank",
        "bank_account_last4": "4417",
        "bank_routing_last4": "0021",
        "bank_verified_at": date(2025, 11, 14),
    },
    {
        "id": "sup_cfl",
        "name": "Cobalt Fire & Life Safety",
        "tax_id": "42-3391087",
        "approved_domain": "cobaltfirelife.example",
        "bank_name": "Crestline Commercial Bank",
        "bank_account_last4": "7734",
        "bank_routing_last4": "0056",
        "bank_verified_at": date(2025, 7, 22),
    },
    {
        "id": "sup_mre",
        "name": "Meridian Roofing & Exteriors",
        "tax_id": "66-8850213",
        "approved_domain": "meridianroofing.example",
        "bank_name": "First Continental Bank",
        "bank_account_last4": "8850",
        "bank_routing_last4": "0044",
        "bank_verified_at": date(2025, 1, 30),
    },
    {
        "id": "sup_nem",
        "name": "Northshore Elevator Maintenance",
        "tax_id": "19-7724456",
        "approved_domain": "northshoreelevator.example",
        "bank_name": "Heartland Municipal Bank",
        "bank_account_last4": "2290",
        "bank_routing_last4": "0087",
        "bank_verified_at": date(2025, 2, 14),
    },
    {
        "id": "sup_pgl",
        "name": "Palisade Grounds & Landscaping",
        "tax_id": "38-2205617",
        "approved_domain": "palisadegrounds.example",
        "bank_name": "First Meridian Savings",
        "bank_account_last4": "3315",
        "bank_routing_last4": "7701",
        "bank_verified_at": date(2025, 5, 8),
    },
    {
        "id": "sup_ruc",
        "name": "Ridgeline Utilities Co-op",
        "tax_id": "71-2249981",
        "approved_domain": "ridgelineutilities.example",
        "bank_name": "Heartland Municipal Bank",
        "bank_account_last4": "6620",
        "bank_routing_last4": "0087",
        "bank_verified_at": date(2025, 3, 11),
    },
    {
        "id": "sup_sph",
        "name": "Summit Peak HVAC Services",
        "tax_id": "61-3390871",
        "approved_domain": "summitpeakhvac.example",
        "bank_name": "Meridian Trust Bank",
        "bank_account_last4": "7742",
        "bank_routing_last4": "3390",
        "bank_verified_at": date(2025, 6, 11),
    },
    {
        "id": "sup_vos",
        "name": "Vantage Office Solutions",
        "tax_id": "84-6613207",
        "approved_domain": "vantageofficesolutions.example",
        "bank_name": "Crestline Commercial Bank",
        "bank_account_last4": "4471",
        "bank_routing_last4": "0056",
        "bank_verified_at": date(2025, 8, 1),
    },
    {
        "id": "sup_wwt",
        "name": "Wellspring Water Treatment",
        "tax_id": "27-1145690",
        "approved_domain": "wellspringwater.example",
        "bank_name": "Meridian Trust Bank",
        "bank_account_last4": "3312",
        "bank_routing_last4": "3390",
        "bank_verified_at": date(2025, 9, 19),
    },
]

SEED_PROPERTIES = [
    {"id": "prop_aldr", "code": "ALDR", "name": "Alder Point Plaza", "city": "Columbus"},
    {"id": "prop_brck", "code": "BRCK", "name": "Brackenridge Commons", "city": "Dayton"},
    {"id": "prop_frnh", "code": "FRNH", "name": "Fernhollow Business Park", "city": "Xenia"},
    {"id": "prop_mlhv", "code": "MLHV", "name": "Millhaven Retail Center", "city": "Springfield"},
    {"id": "prop_ptsd", "code": "PTSD", "name": "Portside Logistics Center", "city": "Toledo"},
]

SEED_COST_CENTERS = [
    {"id": "cc_fac_clean", "code": "CC-FAC-CLEAN", "name": "Facilities — Cleaning & Pest Control"},
    {"id": "cc_fac_grnd", "code": "CC-FAC-GRND", "name": "Facilities — Grounds & Exteriors"},
    {"id": "cc_fac_mech", "code": "CC-FAC-MECH", "name": "Facilities — Mechanical & HVAC"},
    {"id": "cc_fac_sec", "code": "CC-FAC-SEC", "name": "Facilities — Security & Life Safety"},
]

SEED_APPROVERS = [
    {"id": "appr_castellano", "role": "controller", "name": "Marion Castellano", "property_code": None, "region": None},
    {
        "id": "appr_ndiaye",
        "role": "finance_manager",
        "name": "Camille Ndiaye",
        "property_code": None,
        "region": "Northern Ohio region",
    },
    {
        "id": "appr_voss",
        "role": "finance_manager",
        "name": "Adrian Voss",
        "property_code": None,
        "region": "Dayton region",
    },
    {"id": "appr_kessler", "role": "property_manager", "name": "Owen Kessler", "property_code": "PTSD", "region": None},
    {"id": "appr_solis", "role": "property_manager", "name": "Renata Solis", "property_code": "FRNH", "region": None},
    {"id": "appr_alvarez", "role": "property_manager", "name": "Dana Alvarez", "property_code": "ALDR", "region": None},
    {
        "id": "appr_whitfield",
        "role": "property_manager",
        "name": "Marcus Whitfield",
        "property_code": "BRCK",
        "region": None,
    },
    {
        "id": "appr_chandran",
        "role": "property_manager",
        "name": "Priya Chandran",
        "property_code": "MLHV",
        "region": None,
    },
    {
        "id": "appr_marchetti",
        "role": "regional_operations_manager",
        "name": "Theo Marchetti",
        "property_code": None,
        "region": "Northern Ohio region",
    },
    {
        "id": "appr_fenwick",
        "role": "regional_operations_manager",
        "name": "Grace Fenwick",
        "property_code": None,
        "region": "Dayton region",
    },
]

# (po_id, po_number, supplier_id, property_code, status, issued_date, not_to_exceed, lines)
SEED_POS = [
    (
        "po_10312",
        "PO-10312",
        "sup_sph",
        "BRCK",
        "open",
        date(2026, 7, 28),
        5900.00,
        [
            ("Emergency compressor unit replacement", 1, 3400.00),
            ("HVAC technician labor, emergency repair", 8, 145.00),
            ("Refrigerant recharge, R-410A 5lb", 1, 380.00),
            ("Emergency dispatch / diagnostic fee", 1, 230.00),
        ],
    ),
    (
        "po_10456",
        "PO-10456",
        "sup_bjs",
        "ALDR",
        "open",
        date(2026, 7, 15),
        800.00,
        [
            ("Multi-surface cleaner, 1gal", 24, 9.70),
            ("Trash liners, case of 250", 10, 14.20),
            ("Microfiber mop heads", 12, 8.15),
            ("Floor degreaser concentrate", 6, 22.50),
            ("Glass cleaner spray, case of 12", 8, 20.95),
        ],
    ),
    (
        "po_10528",
        "PO-10528",
        "sup_pgl",
        "FRNH",
        "open",
        date(2026, 7, 20),
        1900.00,
        [("Quarterly mowing & edging service", 1, 1150.00), ("Seasonal mulch & bed refresh", 1, 750.00)],
    ),
    (
        "po_10611",
        "PO-10611",
        "sup_vos",
        "MLHV",
        "open",
        date(2026, 7, 10),
        640.00,
        [("Toner cartridges (black, high-yield)", 12, 38.50), ("Copier paper (case)", 10, 17.80)],
    ),
    (
        "po_10622",
        "PO-10622",
        "sup_ruc",
        "PTSD",
        "open",
        date(2026, 7, 5),
        2150.00,
        [("Water/sewer service — monthly", 1, 2150.00)],
    ),
    (
        "po_10633",
        "PO-10633",
        "sup_nem",
        "ALDR",
        "open",
        date(2026, 6, 28),
        980.00,
        [("Quarterly elevator maintenance & inspection", 1, 980.00)],
    ),
    (
        "po_10644",
        "PO-10644",
        "sup_cfl",
        "BRCK",
        "open",
        date(2026, 7, 1),
        1420.00,
        [("Fire alarm annual inspection", 1, 860.00), ("Sprinkler system test", 1, 560.00)],
    ),
    (
        "po_10655",
        "PO-10655",
        "sup_mre",
        "PTSD",
        "closed",
        date(2026, 5, 12),
        4200.00,
        [("Roof patch repair — loading dock", 1, 4200.00)],
    ),
    (
        "po_10666",
        "PO-10666",
        "sup_wwt",
        "MLHV",
        "open",
        date(2026, 7, 8),
        610.00,
        [("Cooling tower water treatment — monthly", 1, 610.00)],
    ),
    (
        "po_10677",
        "PO-10677",
        "sup_aps",
        "FRNH",
        "open",
        date(2026, 6, 20),
        1850.00,
        [("Gate arm repair & recalibration", 2, 925.00)],
    ),
    (
        "po_10688",
        "PO-10688",
        "sup_bjs",
        "MLHV",
        "open",
        date(2026, 7, 22),
        580.00,
        [("General cleaning supplies restock", 40, 14.50)],
    ),
    (
        "po_10699",
        "PO-10699",
        "sup_css",
        "ALDR",
        "open",
        date(2026, 7, 2),
        2400.00,
        [("Weekend patrol contract — monthly", 1, 2400.00)],
    ),
    (
        "po_10710",
        "PO-10710",
        "sup_sph",
        "MLHV",
        "open",
        date(2026, 6, 15),
        1560.00,
        [("Quarterly HVAC preventive maintenance", 1, 1560.00)],
    ),
    (
        "po_10721",
        "PO-10721",
        "sup_pgl",
        "ALDR",
        "open",
        date(2026, 7, 18),
        1050.00,
        [("Monthly mowing service", 3, 350.00)],
    ),
    (
        "po_10732",
        "PO-10732",
        "sup_vos",
        "PTSD",
        "closed",
        date(2026, 5, 1),
        320.00,
        [("Office chairs (replacement)", 4, 80.00)],
    ),
    (
        "po_10743",
        "PO-10743",
        "sup_ruc",
        "BRCK",
        "open",
        date(2026, 7, 1),
        1980.00,
        [("Electric utility service — monthly", 1, 1980.00)],
    ),
    (
        "po_10754",
        "PO-10754",
        "sup_apc",
        "PTSD",
        "open",
        date(2026, 7, 1),
        980.00,
        [("Monthly pest control service", 1, 980.00)],
    ),
    (
        "po_10765",
        "PO-10765",
        "sup_cfl",
        "MLHV",
        "cancelled",
        date(2026, 4, 10),
        1100.00,
        [("Emergency lighting battery replacement", 1, 1100.00)],
    ),
    (
        "po_10776",
        "PO-10776",
        "sup_nem",
        "FRNH",
        "open",
        date(2026, 7, 14),
        890.00,
        [("Elevator callback repair", 1, 890.00)],
    ),
    (
        "po_10787",
        "PO-10787",
        "sup_mre",
        "ALDR",
        "open",
        date(2026, 7, 25),
        3100.00,
        [("Gutter replacement — north wing", 1, 3100.00)],
    ),
]

# (receipt_id, po_id, received_date, received_by) — 12 receipts against open POs.
SEED_RECEIPTS = [
    ("rcpt_10456", "po_10456", date(2026, 7, 30), "D. Alvarez"),
    ("rcpt_10312", "po_10312", date(2026, 8, 1), "R. Okafor"),
    ("rcpt_10611", "po_10611", date(2026, 7, 12), "J. Meadows"),
    ("rcpt_10633", "po_10633", date(2026, 6, 30), "K. Osei"),
    ("rcpt_10644", "po_10644", date(2026, 7, 3), "L. Bianchi"),
    ("rcpt_10655", "po_10655", date(2026, 5, 16), "S. Reyes"),
    ("rcpt_10666", "po_10666", date(2026, 7, 10), "M. Tran"),
    ("rcpt_10699", "po_10699", date(2026, 7, 5), "D. Alvarez"),
    ("rcpt_10710", "po_10710", date(2026, 6, 18), "P. Chandran"),
    ("rcpt_10721", "po_10721", date(2026, 7, 21), "D. Alvarez"),
    ("rcpt_10732", "po_10732", date(2026, 5, 3), "O. Kessler"),
    ("rcpt_10754", "po_10754", date(2026, 7, 4), "O. Kessler"),
]

# Receipt line quantities mirror the matching PO line exactly except where
# noted — these are "goods received as ordered" confirmations, not exceptions.
SEED_RECEIPT_LINES = {
    "rcpt_10456": [
        ("Multi-surface cleaner, 1gal", 24),
        ("Trash liners, case of 250", 10),
        ("Microfiber mop heads", 12),
        ("Floor degreaser concentrate", 6),
        ("Glass cleaner spray, case of 12", 8),
    ],
    "rcpt_10312": [
        ("Emergency compressor unit replacement", 1),
        ("HVAC technician labor, emergency repair", 8),
        ("Refrigerant recharge, R-410A 5lb", 1),
        ("Emergency dispatch / diagnostic fee", 1),
    ],
    "rcpt_10611": [("Toner cartridges (black, high-yield)", 12), ("Copier paper (case)", 10)],
    "rcpt_10633": [("Quarterly elevator maintenance & inspection", 1)],
    "rcpt_10644": [("Fire alarm annual inspection", 1), ("Sprinkler system test", 1)],
    "rcpt_10655": [("Roof patch repair — loading dock", 1)],
    "rcpt_10666": [("Cooling tower water treatment — monthly", 1)],
    "rcpt_10699": [("Weekend patrol contract — monthly", 1)],
    "rcpt_10710": [("Quarterly HVAC preventive maintenance", 1)],
    "rcpt_10721": [("Monthly mowing service", 3)],
    "rcpt_10732": [("Office chairs (replacement)", 4)],
    "rcpt_10754": [("Monthly pest control service", 1)],
}

# 24 historical invoices — duplicate-detection ground truth. Read-only mirror
# of the live seed used to construct eval-case documents so generated
# invoices are correct by construction, per evals/seed-data.ts.
SEED_HISTORICAL_INVOICES = [
    ("sup_apc", "APC-88213", date(2026, 7, 18), 1240.00, "APC_Invoice_88213_July.pdf"),
    ("sup_bjs", "BJS-55210", date(2026, 6, 14), 761.78, "BJS-55210.pdf"),
    ("sup_pgl", "PGL-61002", date(2026, 7, 5), 1050.00, "PGL-61002.pdf"),
    ("sup_ruc", "RUC-30021", date(2026, 6, 1), 2150.00, "RUC-30021.pdf"),
    ("sup_ruc", "RUC-30099", date(2026, 7, 1), 1980.00, "RUC-30099.pdf"),
    ("sup_vos", "VOS-22110", date(2026, 5, 28), 691.20, "VOS-22110.pdf"),
    ("sup_vos", "VOS-22240", date(2026, 6, 30), 345.60, "VOS-22240.pdf"),
    ("sup_nem", "NEM-15501", date(2026, 4, 29), 980.00, "NEM-15501.pdf"),
    ("sup_nem", "NEM-15602", date(2026, 7, 19), 890.00, "NEM-15602.pdf"),
    ("sup_cfl", "CFL-08820", date(2026, 6, 11), 1420.00, "CFL-08820.pdf"),
    ("sup_mre", "MRE-04410", date(2026, 5, 19), 4536.00, "MRE-04410.pdf"),
    ("sup_mre", "MRE-04512", date(2026, 7, 30), 3348.00, "MRE-04512.pdf"),
    ("sup_bjs", "BJS-55402", date(2026, 7, 8), 748.65, "BJS-55402.pdf"),
    ("sup_wwt", "WWT-11290", date(2026, 6, 8), 610.00, "WWT-11290.pdf"),
    ("sup_wwt", "WWT-11355", date(2026, 7, 8), 610.00, "WWT-11355.pdf"),
    ("sup_aps", "APS-06610", date(2026, 6, 25), 1850.00, "APS-06610.pdf"),
    ("sup_vos", "VOS-22380", date(2026, 7, 22), 498.96, "VOS-22380.pdf"),
    ("sup_sph", "SPH-40655", date(2026, 6, 20), 1252.80, "SPH-40655.pdf"),
    ("sup_sph", "SPH-40780", date(2026, 7, 15), 1684.80, "SPH-40780.pdf"),
    ("sup_apc", "APC-87950", date(2026, 6, 18), 980.00, "APC-87950.pdf"),
    ("sup_apc", "APC-88090", date(2026, 6, 25), 1240.00, "APC-88090.pdf"),
    ("sup_css", "CSS-71880", date(2026, 6, 2), 2400.00, "CSS-71880.pdf"),
    ("sup_css", "CSS-71995", date(2026, 7, 2), 2400.00, "CSS-71995.pdf"),
    ("sup_pgl", "PGL-60870", date(2026, 6, 5), 1050.00, "PGL-60870.pdf"),
]


def _normalize_alnum(raw: str) -> str:
    return "".join(ch for ch in raw.upper() if ch.isalnum())


# Kept as a separate name for clarity at call sites, but identical to
# _normalize_alnum — invoice numbers and tax IDs are normalized the same way.
_normalize_invoice_number = _normalize_alnum


def seed_all(db: Session) -> None:
    """Idempotent, and safe against a concurrent seeder (web + worker can both
    reach this on a fresh boot): a collision here means the other process
    already seeded the row, so it's swallowed rather than raised."""
    try:
        for row in SEED_SUPPLIERS:
            if not db.get(Supplier, row["id"]):
                db.add(Supplier(**row, tax_id_normalized=_normalize_alnum(row["tax_id"]), status="approved"))
        for row in SEED_PROPERTIES:
            if not db.get(Property, row["id"]):
                db.add(Property(**row))
        for row in SEED_COST_CENTERS:
            if not db.get(CostCenter, row["id"]):
                db.add(CostCenter(**row))
        for row in SEED_APPROVERS:
            if not db.get(Approver, row["id"]):
                db.add(Approver(**row))
        db.flush()

        for po_id, po_number, supplier_id, property_code, status, issued_date, not_to_exceed, lines in SEED_POS:
            if not db.get(PurchaseOrder, po_id):
                db.add(
                    PurchaseOrder(
                        id=po_id,
                        po_number=po_number,
                        supplier_id=supplier_id,
                        property_code=property_code,
                        status=status,
                        issued_date=issued_date,
                        not_to_exceed=not_to_exceed,
                        currency="USD",
                    )
                )
                db.flush()
                for i, (description, qty, price) in enumerate(lines, start=1):
                    db.add(
                        PoLine(
                            purchase_order_id=po_id,
                            line_number=i,
                            description=description,
                            approved_quantity=qty,
                            unit_price=price,
                        )
                    )

        for receipt_id, po_id, received_date, received_by in SEED_RECEIPTS:
            if not db.get(Receipt, receipt_id):
                db.add(Receipt(id=receipt_id, purchase_order_id=po_id, received_date=received_date, received_by=received_by))
                db.flush()
                for description, qty in SEED_RECEIPT_LINES[receipt_id]:
                    db.add(ReceiptLine(receipt_id=receipt_id, description=description, quantity_received=qty))

        for supplier_id, invoice_number, invoice_date, total, original_file_name in SEED_HISTORICAL_INVOICES:
            existing_id = f"hist_{invoice_number.lower()}"
            if not db.get(ExistingInvoice, existing_id):
                db.add(
                    ExistingInvoice(
                        id=existing_id,
                        supplier_id=supplier_id,
                        invoice_number=invoice_number,
                        invoice_number_normalized=_normalize_invoice_number(invoice_number),
                        invoice_date=invoice_date,
                        total=total,
                        original_file_name=original_file_name,
                    )
                )

        active_policy = db.scalar(select(Policy).where(Policy.version == POLICY_VERSION))
        if not active_policy:
            db.add(Policy(version=POLICY_VERSION, config=policy_config_to_dict(DEFAULT_POLICY), active=True))

        db.commit()
    except IntegrityError:
        db.rollback()


def main() -> None:
    from .db import init_db, session_scope

    init_db()
    with session_scope() as db:
        seed_all(db)


if __name__ == "__main__":
    main()
