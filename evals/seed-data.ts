// Read-only mirror of the live Supabase seed data (suppliers, POs, and the
// 24 seeded historical invoices) that evals/generators.ts builds cases
// against. This is NOT what the pipeline reads at runtime — the pipeline
// always queries the real tables — it's ground truth for CONSTRUCTING eval
// case documents so generated invoices are correct by construction (real
// tax IDs, real bank details, real approved quantities/prices) instead of
// hand-typed and occasionally wrong, which is how the first authored batch
// got a bank-detail mismatch and a duplicate-identity collision wrong.
// Snapshot taken 2026-08-08 — re-sync if the seed migration ever changes.

export type SeedSupplier = {
  name: string;
  taxId: string;
  prefix: string; // matches the historical invoice-number prefix already in use
  bankName: string;
  bankAccountLast4: string;
  bankRoutingLast4: string;
};

export const SEED_SUPPLIERS: SeedSupplier[] = [
  { name: "Anchor Point Pest Control", taxId: "29-8801145", prefix: "APC", bankName: "Anchor Point Pest Control", bankAccountLast4: "5510", bankRoutingLast4: "1188" },
  { name: "Atlas Parking Systems", taxId: "93-4402718", prefix: "APS", bankName: "Crestline Commercial Bank", bankAccountLast4: "1156", bankRoutingLast4: "0056" },
  { name: "Brightway Janitorial Supply", taxId: "47-1122334", prefix: "BJS", bankName: "First Continental Bank", bankAccountLast4: "2231", bankRoutingLast4: "0044" },
  { name: "Coastal Sentinel Security Services", taxId: "55-4471902", prefix: "CSS", bankName: "First Continental Bank", bankAccountLast4: "4417", bankRoutingLast4: "0021" },
  { name: "Cobalt Fire & Life Safety", taxId: "42-3391087", prefix: "CFL", bankName: "Crestline Commercial Bank", bankAccountLast4: "7734", bankRoutingLast4: "0056" },
  { name: "Meridian Roofing & Exteriors", taxId: "66-8850213", prefix: "MRE", bankName: "First Continental Bank", bankAccountLast4: "8850", bankRoutingLast4: "0044" },
  { name: "Northshore Elevator Maintenance", taxId: "19-7724456", prefix: "NEM", bankName: "Heartland Municipal Bank", bankAccountLast4: "2290", bankRoutingLast4: "0087" },
  { name: "Palisade Grounds & Landscaping", taxId: "38-2205617", prefix: "PGL", bankName: "First Meridian Savings", bankAccountLast4: "3315", bankRoutingLast4: "7701" },
  { name: "Ridgeline Utilities Co-op", taxId: "71-2249981", prefix: "RUC", bankName: "Heartland Municipal Bank", bankAccountLast4: "6620", bankRoutingLast4: "0087" },
  { name: "Summit Peak HVAC Services", taxId: "61-3390871", prefix: "SPH", bankName: "Meridian Trust Bank", bankAccountLast4: "7742", bankRoutingLast4: "3390" },
  { name: "Vantage Office Solutions", taxId: "84-6613207", prefix: "VOS", bankName: "Crestline Commercial Bank", bankAccountLast4: "4471", bankRoutingLast4: "0056" },
  { name: "Wellspring Water Treatment", taxId: "27-1145690", prefix: "WWT", bankName: "Meridian Trust Bank", bankAccountLast4: "3312", bankRoutingLast4: "3390" },
];

export type SeedPoLine = { description: string; approvedQuantity: number; unitPrice: number };
export type SeedPo = {
  supplierName: string;
  poNumber: string;
  status: "open" | "closed" | "cancelled";
  propertyCode: string;
  lines: SeedPoLine[];
};

// Only "open" POs are usable for clean-match / price-exception / arithmetic
// cases — a closed or cancelled PO fails po_status regardless of anything
// else, which would misattribute the case's failure.
export const SEED_POS: SeedPo[] = [
  { supplierName: "Anchor Point Pest Control", poNumber: "PO-10754", status: "open", propertyCode: "PTSD", lines: [{ description: "Monthly pest control service", approvedQuantity: 1, unitPrice: 980 }] },
  { supplierName: "Atlas Parking Systems", poNumber: "PO-10677", status: "open", propertyCode: "FRNH", lines: [{ description: "Gate arm repair & recalibration", approvedQuantity: 2, unitPrice: 925 }] },
  { supplierName: "Brightway Janitorial Supply", poNumber: "PO-10456", status: "open", propertyCode: "ALDR", lines: [
    { description: "Multi-surface cleaner, 1gal", approvedQuantity: 24, unitPrice: 9.75 },
    { description: "Trash liners, case of 250", approvedQuantity: 10, unitPrice: 14.2 },
    { description: "Microfiber mop heads", approvedQuantity: 12, unitPrice: 8.15 },
    { description: "Floor degreaser concentrate", approvedQuantity: 6, unitPrice: 22.5 },
    { description: "Glass cleaner spray, case of 12", approvedQuantity: 8, unitPrice: 20.95 },
  ] },
  { supplierName: "Brightway Janitorial Supply", poNumber: "PO-10688", status: "open", propertyCode: "MLHV", lines: [{ description: "General cleaning supplies restock", approvedQuantity: 40, unitPrice: 14.5 }] },
  { supplierName: "Coastal Sentinel Security Services", poNumber: "PO-10699", status: "open", propertyCode: "ALDR", lines: [{ description: "Weekend patrol contract — monthly", approvedQuantity: 1, unitPrice: 2400 }] },
  { supplierName: "Cobalt Fire & Life Safety", poNumber: "PO-10644", status: "open", propertyCode: "BRCK", lines: [
    { description: "Fire alarm annual inspection", approvedQuantity: 1, unitPrice: 860 },
    { description: "Sprinkler system test", approvedQuantity: 1, unitPrice: 560 },
  ] },
  { supplierName: "Cobalt Fire & Life Safety", poNumber: "PO-10765", status: "cancelled", propertyCode: "MLHV", lines: [{ description: "Emergency lighting battery replacement", approvedQuantity: 1, unitPrice: 1100 }] },
  { supplierName: "Meridian Roofing & Exteriors", poNumber: "PO-10655", status: "closed", propertyCode: "PTSD", lines: [{ description: "Roof patch repair — loading dock", approvedQuantity: 1, unitPrice: 4200 }] },
  { supplierName: "Meridian Roofing & Exteriors", poNumber: "PO-10787", status: "open", propertyCode: "ALDR", lines: [{ description: "Gutter replacement — north wing", approvedQuantity: 1, unitPrice: 3100 }] },
  { supplierName: "Northshore Elevator Maintenance", poNumber: "PO-10633", status: "open", propertyCode: "ALDR", lines: [{ description: "Quarterly elevator maintenance & inspection", approvedQuantity: 1, unitPrice: 980 }] },
  { supplierName: "Northshore Elevator Maintenance", poNumber: "PO-10776", status: "open", propertyCode: "FRNH", lines: [{ description: "Elevator callback repair", approvedQuantity: 1, unitPrice: 890 }] },
  { supplierName: "Palisade Grounds & Landscaping", poNumber: "PO-10528", status: "open", propertyCode: "FRNH", lines: [
    { description: "Quarterly mowing & edging service", approvedQuantity: 1, unitPrice: 1150 },
    { description: "Seasonal mulch & bed refresh", approvedQuantity: 1, unitPrice: 750 },
  ] },
  { supplierName: "Palisade Grounds & Landscaping", poNumber: "PO-10721", status: "open", propertyCode: "ALDR", lines: [{ description: "Monthly mowing service", approvedQuantity: 3, unitPrice: 350 }] },
  { supplierName: "Ridgeline Utilities Co-op", poNumber: "PO-10622", status: "open", propertyCode: "PTSD", lines: [{ description: "Water/sewer service — monthly", approvedQuantity: 1, unitPrice: 2150 }] },
  { supplierName: "Ridgeline Utilities Co-op", poNumber: "PO-10743", status: "open", propertyCode: "BRCK", lines: [{ description: "Electric utility service — monthly", approvedQuantity: 1, unitPrice: 1980 }] },
  { supplierName: "Summit Peak HVAC Services", poNumber: "PO-10312", status: "open", propertyCode: "BRCK", lines: [
    { description: "Emergency compressor unit replacement", approvedQuantity: 1, unitPrice: 3400 },
    { description: "HVAC technician labor, emergency repair", approvedQuantity: 8, unitPrice: 145 },
    { description: "Refrigerant recharge, R-410A 5lb", approvedQuantity: 1, unitPrice: 380 },
    { description: "Emergency dispatch / diagnostic fee", approvedQuantity: 1, unitPrice: 230 },
  ] },
  { supplierName: "Summit Peak HVAC Services", poNumber: "PO-10710", status: "open", propertyCode: "MLHV", lines: [{ description: "Quarterly HVAC preventive maintenance", approvedQuantity: 1, unitPrice: 1560 }] },
  { supplierName: "Vantage Office Solutions", poNumber: "PO-10611", status: "open", propertyCode: "MLHV", lines: [
    { description: "Toner cartridges (black, high-yield)", approvedQuantity: 12, unitPrice: 38.5 },
    { description: "Copier paper (case)", approvedQuantity: 10, unitPrice: 17.8 },
  ] },
  { supplierName: "Vantage Office Solutions", poNumber: "PO-10732", status: "closed", propertyCode: "PTSD", lines: [{ description: "Office chairs (replacement)", approvedQuantity: 4, unitPrice: 80 }] },
  { supplierName: "Wellspring Water Treatment", poNumber: "PO-10666", status: "open", propertyCode: "MLHV", lines: [{ description: "Cooling tower water treatment — monthly", approvedQuantity: 1, unitPrice: 610 }] },
];

export const OPEN_POS: SeedPo[] = SEED_POS.filter((po) => po.status === "open");

export type SeedHistoricalInvoice = {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: string;
};

export const SEED_HISTORICAL_INVOICES: SeedHistoricalInvoice[] = [
  { supplierName: "Anchor Point Pest Control", invoiceNumber: "APC-88213", invoiceDate: "2026-07-18", total: "1240.00" },
  { supplierName: "Brightway Janitorial Supply", invoiceNumber: "BJS-55210", invoiceDate: "2026-06-14", total: "761.78" },
  { supplierName: "Palisade Grounds & Landscaping", invoiceNumber: "PGL-61002", invoiceDate: "2026-07-05", total: "1050.00" },
  { supplierName: "Ridgeline Utilities Co-op", invoiceNumber: "RUC-30021", invoiceDate: "2026-06-01", total: "2150.00" },
  { supplierName: "Ridgeline Utilities Co-op", invoiceNumber: "RUC-30099", invoiceDate: "2026-07-01", total: "1980.00" },
  { supplierName: "Vantage Office Solutions", invoiceNumber: "VOS-22110", invoiceDate: "2026-05-28", total: "691.20" },
  { supplierName: "Vantage Office Solutions", invoiceNumber: "VOS-22240", invoiceDate: "2026-06-30", total: "345.60" },
  { supplierName: "Northshore Elevator Maintenance", invoiceNumber: "NEM-15501", invoiceDate: "2026-04-29", total: "980.00" },
  { supplierName: "Northshore Elevator Maintenance", invoiceNumber: "NEM-15602", invoiceDate: "2026-07-19", total: "890.00" },
  { supplierName: "Cobalt Fire & Life Safety", invoiceNumber: "CFL-08820", invoiceDate: "2026-06-11", total: "1420.00" },
  { supplierName: "Meridian Roofing & Exteriors", invoiceNumber: "MRE-04410", invoiceDate: "2026-05-19", total: "4536.00" },
  { supplierName: "Meridian Roofing & Exteriors", invoiceNumber: "MRE-04512", invoiceDate: "2026-07-30", total: "3348.00" },
  { supplierName: "Brightway Janitorial Supply", invoiceNumber: "BJS-55402", invoiceDate: "2026-07-08", total: "748.65" },
  { supplierName: "Wellspring Water Treatment", invoiceNumber: "WWT-11290", invoiceDate: "2026-06-08", total: "610.00" },
  { supplierName: "Wellspring Water Treatment", invoiceNumber: "WWT-11355", invoiceDate: "2026-07-08", total: "610.00" },
  { supplierName: "Atlas Parking Systems", invoiceNumber: "APS-06610", invoiceDate: "2026-06-25", total: "1850.00" },
  { supplierName: "Vantage Office Solutions", invoiceNumber: "VOS-22380", invoiceDate: "2026-07-22", total: "498.96" },
  { supplierName: "Summit Peak HVAC Services", invoiceNumber: "SPH-40655", invoiceDate: "2026-06-20", total: "1252.80" },
  { supplierName: "Summit Peak HVAC Services", invoiceNumber: "SPH-40780", invoiceDate: "2026-07-15", total: "1684.80" },
  { supplierName: "Anchor Point Pest Control", invoiceNumber: "APC-87950", invoiceDate: "2026-06-18", total: "980.00" },
  { supplierName: "Anchor Point Pest Control", invoiceNumber: "APC-88090", invoiceDate: "2026-06-25", total: "1240.00" },
  { supplierName: "Coastal Sentinel Security Services", invoiceNumber: "CSS-71880", invoiceDate: "2026-06-02", total: "2400.00" },
  { supplierName: "Coastal Sentinel Security Services", invoiceNumber: "CSS-71995", invoiceDate: "2026-07-02", total: "2400.00" },
  { supplierName: "Palisade Grounds & Landscaping", invoiceNumber: "PGL-60870", invoiceDate: "2026-06-05", total: "1050.00" },
];
