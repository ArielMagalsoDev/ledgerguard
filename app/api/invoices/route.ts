import { NextResponse } from "next/server";
import { invoiceSubmissionSchema, submitInvoice } from "@/lib/workflow/submit-invoice";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = invoiceSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_submission", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await submitInvoice(parsed.data);
    return NextResponse.json(result, { status: result.isReplay ? 200 : 201 });
  } catch (err) {
    console.error("[POST /api/invoices]", err);
    return NextResponse.json({ error: "workflow_intake_failed" }, { status: 500 });
  }
}
