/**
 * Deterministic, API-free test of the core safety guarantee behind Phase 3:
 * "no uncertain required monetary field passes automatically"
 * (CLAUDE.md, Phase 3 acceptance criteria). This is deliberately a pure unit
 * test over synthetic data rather than a live model call — the guarantee is
 * a property of align-evidence.ts and validate.ts's code, and should not
 * depend on whether a particular model happens to produce uncertain output
 * on a given run.
 *
 *   npm run test-guardrails
 */
import { alignExtraction } from "@/lib/extraction/align-evidence";
import { validateRequiredFields } from "@/lib/extraction/validate";
import { computeArithmeticControls } from "@/lib/extraction/arithmetic";
import { rawExtractionSchema, type RawExtraction } from "@/lib/extraction/schema";
import type { TextLayerLine } from "@/lib/extraction/pdf-text-layer";

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const field = (value: string | null, quote: string | null) => ({ value, quote });

// A minimal document text layer — only "Invoice #: PGL-9001" and the line
// items are actually printed on the page. Test 4 needs a few more real
// lines (date/currency/tax) to genuinely verify against, now that
// align-evidence.ts requires a field's own value to appear in its quote —
// see that file's valueAppearsInQuote for why.
const textLayer: TextLayerLine[] = [
  { page: 1, text: "Invoice #: PGL-9001", box: [0.1, 0.1, 0.4, 0.13] },
  { page: 1, text: "Invoice Date: 2026-08-01", box: [0.1, 0.14, 0.4, 0.17] },
  { page: 1, text: "Due Date: 2026-09-01", box: [0.1, 0.18, 0.4, 0.21] },
  { page: 1, text: "Supplier: Palisade Grounds & Landscaping", box: [0.1, 0.22, 0.5, 0.25] },
  { page: 1, text: "Supplier Tax ID: 38-2205617", box: [0.1, 0.26, 0.4, 0.29] },
  { page: 1, text: "Currency: USD", box: [0.1, 0.3, 0.3, 0.33] },
  { page: 1, text: "Widget install — Qty 2 @ $50.00 = $100.00", box: [0.1, 0.32, 0.6, 0.35] },
  { page: 1, text: "Subtotal: $100.00", box: [0.1, 0.38, 0.4, 0.41] },
  { page: 1, text: "Sales Tax: $0.00", box: [0.1, 0.42, 0.4, 0.45] },
  { page: 1, text: "Total Due: $100.00", box: [0.1, 0.46, 0.4, 0.49] },
];

console.log("Test 1: a value the model claims but never quotes drops to uncertain");
{
  const raw: RawExtraction = rawExtractionSchema.parse({
    invoiceNumber: field("PGL-9001", "Invoice #: PGL-9001"),
    invoiceDate: field("2026-08-01", null), // value given, no quote — model didn't ground it
    dueDate: field(null, null),
    supplierName: field("Palisade Grounds & Landscaping", "Supplier: Palisade Grounds & Landscaping"),
    supplierTaxId: field(null, null),
    purchaseOrderNumber: field(null, null),
    currency: field("USD", null),
    subtotal: field("100.00", "Subtotal: $100.00"),
    tax: field("0.00", null),
    total: field("100.00", "Total Due: $100.00"),
    remittanceDetails: field(null, null),
    notes: field(null, null),
    lineItems: [
      {
        lineNumber: 1,
        description: field("Widget install", "Widget install — Qty 2 @ $50.00 = $100.00"),
        quantity: field("2", "Widget install — Qty 2 @ $50.00 = $100.00"),
        unitPrice: field("50.00", "Widget install — Qty 2 @ $50.00 = $100.00"),
        lineTotal: field("100.00", "Widget install — Qty 2 @ $50.00 = $100.00"),
      },
    ],
  });

  const extracted = alignExtraction(raw, textLayer);
  check("invoiceDate (no quote) is uncertain, not verified", extracted.invoiceDate.status === "uncertain");
  check("invoiceDate value is still preserved for display", extracted.invoiceDate.value === "2026-08-01");
  check("invoiceNumber (has quote, found in text) is verified", extracted.invoiceNumber.status === "verified");
}

console.log("\nTest 2: a quote the model fabricates — not actually in the document — is uncertain");
{
  const raw = rawExtractionSchema.parse({
    invoiceNumber: field("PGL-9001", "Invoice #: PGL-9001"),
    invoiceDate: field(null, null),
    dueDate: field(null, null),
    supplierName: field(null, null),
    supplierTaxId: field(null, null),
    purchaseOrderNumber: field(null, null),
    currency: field(null, null),
    subtotal: field(null, null),
    tax: field("500.00", "Tax: $500.00 (nonexistent line)"), // hallucinated quote
    total: field(null, null),
    remittanceDetails: field(null, null),
    notes: field(null, null),
    lineItems: [],
  });

  const extracted = alignExtraction(raw, textLayer);
  check(
    "tax field with a fabricated quote is uncertain (hallucination guard fires)",
    extracted.tax.status === "uncertain",
    `got status=${extracted.tax.status}`
  );
}

console.log("\nTest 3: required-field validation refuses to certify an extraction with any uncertain required field");
{
  const raw = rawExtractionSchema.parse({
    invoiceNumber: field("PGL-9001", "Invoice #: PGL-9001"),
    invoiceDate: field("2026-08-01", null), // uncertain
    dueDate: field(null, null),
    supplierName: field("Palisade Grounds & Landscaping", "Supplier: Palisade Grounds & Landscaping"),
    supplierTaxId: field("38-2205617", null), // uncertain — required
    purchaseOrderNumber: field(null, null),
    currency: field("USD", null), // uncertain — required
    subtotal: field("100.00", "Subtotal: $100.00"),
    tax: field("0.00", null), // uncertain — required
    total: field("100.00", "Total Due: $100.00"),
    remittanceDetails: field(null, null),
    notes: field(null, null),
    lineItems: [
      {
        lineNumber: 1,
        description: field("Widget install", "Widget install — Qty 2 @ $50.00 = $100.00"),
        quantity: field("2", "Widget install — Qty 2 @ $50.00 = $100.00"),
        unitPrice: field("50.00", "Widget install — Qty 2 @ $50.00 = $100.00"),
        lineTotal: field("100.00", "Widget install — Qty 2 @ $50.00 = $100.00"),
      },
    ],
  });

  const extracted = alignExtraction(raw, textLayer);
  const validation = validateRequiredFields(extracted);

  check("requiresReview is true when required fields are uncertain", validation.requiresReview === true);
  check(
    "problemFields lists exactly the uncertain required fields",
    ["invoiceDate", "supplierTaxId", "currency", "tax"].every((f) => validation.problemFields.includes(f)),
    validation.problemFields.join(", ")
  );

  const arithmeticControls = computeArithmeticControls(extracted, { taxRoundingToleranceUsd: 0.02 });
  const taxControl = arithmeticControls.find((c) => c.controlId === "arithmetic_tax_total");
  check(
    "arithmetic_tax_total control fails (not silently passes) when tax is unverified",
    taxControl?.status === "failed",
    `got status=${taxControl?.status}`
  );
  check("failing arithmetic control is blocking", taxControl?.blocking === true);
}

console.log("\nTest 4: a fully clean, fully verifiable extraction passes validation and arithmetic");
{
  const raw = rawExtractionSchema.parse({
    invoiceNumber: field("PGL-9001", "Invoice #: PGL-9001"),
    invoiceDate: field("2026-08-01", "Invoice Date: 2026-08-01"),
    dueDate: field("2026-09-01", "Due Date: 2026-09-01"),
    supplierName: field("Palisade Grounds & Landscaping", "Supplier: Palisade Grounds & Landscaping"),
    supplierTaxId: field("38-2205617", "Supplier Tax ID: 38-2205617"),
    purchaseOrderNumber: field(null, null),
    currency: field("USD", "Currency: USD"),
    subtotal: field("100.00", "Subtotal: $100.00"),
    tax: field("0.00", "Sales Tax: $0.00"),
    total: field("100.00", "Total Due: $100.00"),
    remittanceDetails: field(null, null),
    notes: field(null, null),
    lineItems: [
      {
        lineNumber: 1,
        description: field("Widget install", "Widget install — Qty 2 @ $50.00 = $100.00"),
        quantity: field("2", "Widget install — Qty 2 @ $50.00 = $100.00"),
        unitPrice: field("50.00", "Widget install — Qty 2 @ $50.00 = $100.00"),
        lineTotal: field("100.00", "Widget install — Qty 2 @ $50.00 = $100.00"),
      },
    ],
  });

  const extracted = alignExtraction(raw, textLayer);
  const validation = validateRequiredFields(extracted);
  const arithmeticControls = computeArithmeticControls(extracted, { taxRoundingToleranceUsd: 0.02 });

  check("requiresReview is false for a fully verified extraction", validation.requiresReview === false);
  check(
    "all 3 arithmetic controls pass",
    arithmeticControls.every((c) => c.status === "passed"),
    arithmeticControls.map((c) => `${c.controlId}=${c.status}`).join(", ")
  );
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} failing check(s)`);
process.exit(failures === 0 ? 0 : 1);
