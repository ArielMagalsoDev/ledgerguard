import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseDecimalToCents } from "@/lib/money";
import type { ExtractedField, ExtractedInvoice } from "@/lib/types";

const HEADER_FIELDS = [
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "supplierName",
  "supplierTaxId",
  "purchaseOrderNumber",
  "currency",
  "subtotal",
  "tax",
  "total",
  "remittanceDetails",
] as const;

const LINE_FIELDS = ["description", "quantity", "unitPrice", "lineTotal"] as const;
const MONETARY_FIELDS = new Set(["subtotal", "tax", "total", "unitPrice", "lineTotal"]);

const correctionSchema = z.object({
  field: z.enum([...HEADER_FIELDS, ...LINE_FIELDS]),
  value: z.string().min(1),
  lineNumber: z.number().int().optional(),
});

/**
 * Human field-level correction. This is the actual enforcement boundary the
 * spec's Phase 3 "field-level review and correction" line refers to — a
 * corrected value is marked verified with full confidence and audited with
 * actor "human"; it never silently inherits the model's original claim.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = correctionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { field, value, lineNumber } = parsed.data;

  if (MONETARY_FIELDS.has(field) && field !== "quantity" && parseDecimalToCents(value) === null) {
    return NextResponse.json({ error: "invalid_monetary_value" }, { status: 400 });
  }
  if (field === "quantity" && !Number.isFinite(Number(value))) {
    return NextResponse.json({ error: "invalid_quantity_value" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: invoice, error: fetchError } = await db
    .from("invoices")
    .select("id, workflow_id, extracted")
    .eq("id", id)
    .single();

  if (fetchError || !invoice) {
    return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
  }

  const extracted = invoice.extracted as unknown as ExtractedInvoice;
  const correctedField: ExtractedField<string> = {
    field,
    value,
    normalizedValue: undefined,
    confidence: 1,
    status: "verified",
    evidence: [],
  };

  let detail: string;

  if ((LINE_FIELDS as readonly string[]).includes(field)) {
    if (lineNumber == null) {
      return NextResponse.json({ error: "line_number_required" }, { status: 400 });
    }
    const line = extracted.lineItems.find((li) => li.lineNumber === lineNumber);
    if (!line) {
      return NextResponse.json({ error: "line_not_found" }, { status: 404 });
    }
    (line as unknown as Record<string, ExtractedField<string>>)[field] = correctedField;
    detail = `Line ${lineNumber} field "${field}" corrected by a human reviewer to "${value}".`;
  } else {
    (extracted as unknown as Record<string, ExtractedField<string>>)[field] = correctedField;
    detail = `Field "${field}" corrected by a human reviewer to "${value}".`;
  }

  const normalizedColumnUpdate: Record<string, string> = {};
  if (field === "invoiceNumber") normalizedColumnUpdate.invoice_number = value;
  if (field === "invoiceDate") normalizedColumnUpdate.invoice_date = value;
  if (field === "dueDate") normalizedColumnUpdate.due_date = value;
  if (field === "currency") normalizedColumnUpdate.currency = value;
  if (field === "subtotal") normalizedColumnUpdate.subtotal = value;
  if (field === "tax") normalizedColumnUpdate.tax = value;
  if (field === "total") normalizedColumnUpdate.total = value;

  const { error: updateError } = await db
    .from("invoices")
    .update({ extracted, ...normalizedColumnUpdate, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "update_failed", message: updateError.message }, { status: 500 });
  }

  await db.from("audit_events").insert({
    workflow_id: invoice.workflow_id,
    invoice_id: id,
    event_id: `${id}:field_corrected:${Date.now()}`,
    stage: "field_corrected",
    label: "Field corrected",
    detail,
    actor: "human",
  });

  return NextResponse.json({ ok: true, field, lineNumber, value });
}
