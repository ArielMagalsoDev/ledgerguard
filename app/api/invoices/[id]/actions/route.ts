import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { DecisionOutcome } from "@/lib/types";

// Phase 6: role-based human review actions (CLAUDE.md section 19's "comments,
// reassignment, correction, rejection; all human decisions recorded").
// "Correction" is deliberately NOT here — it's the existing Phase 3
// PATCH /api/invoices/[id]/fields endpoint, which now also re-runs
// arithmetic + the decision engine (see that route).
//
// There is no real auth system in this portfolio demo — actorRole/actorName
// are self-declared by the caller, same documented limitation as the rest
// of the project's "single-operator" language. What IS real: the server-side
// re-checks below are the actual enforcement boundary (section 13 — "disabled
// buttons are UX only"), not merely cosmetic. reassignedTo is a ROLE, not an
// individual approver — matches the granularity `approval_route` already
// uses everywhere else; assigning to a named person from the `approvers`
// table is a reasonable future step, not built here.
const ROLES = ["property_manager", "regional_operations_manager", "finance_manager", "controller", "ap_review_team"] as const;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approved"), actorRole: z.enum(ROLES), actorName: z.string().min(1), comment: z.string().min(1).optional() }),
  z.object({ action: z.literal("rejected"), actorRole: z.enum(ROLES), actorName: z.string().min(1), comment: z.string().min(1) }),
  z.object({ action: z.literal("reassigned"), actorRole: z.enum(ROLES), actorName: z.string().min(1), comment: z.string().optional(), reassignedTo: z.enum(ROLES) }),
  z.object({ action: z.literal("commented"), actorRole: z.enum(ROLES), actorName: z.string().min(1), comment: z.string().min(1) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const db = supabaseAdmin();

  const { data: invoice, error: invoiceError } = await db.from("invoices").select("id, workflow_id").eq("id", id).single();
  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
  }

  const { data: decision } = await db.from("decisions").select("outcome, approval_route").eq("invoice_id", id).maybeSingle();
  if (!decision) {
    return NextResponse.json(
      { error: "invoice_not_decided", detail: "This invoice hasn't been through the decision pipeline yet — nothing to review." },
      { status: 409 }
    );
  }
  const outcome = decision.outcome as DecisionOutcome;
  const approvalRoute = (decision.approval_route as string[] | null) ?? [];

  if (input.action === "approved" || input.action === "rejected") {
    const { data: latest } = await db
      .from("review_actions")
      .select("action")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest && (latest.action === "approved" || latest.action === "rejected")) {
      return NextResponse.json(
        { error: "already_resolved", detail: `This invoice was already ${latest.action} — resolution is final.` },
        { status: 409 }
      );
    }
  }

  // Server-side re-checks — the actual enforcement boundary (CLAUDE.md
  // section 13), never trust that a disabled button was really disabled.
  if (input.action === "approved") {
    if (outcome === "duplicate_hold") {
      return NextResponse.json(
        { error: "cannot_approve_duplicate_hold", detail: "A duplicate hold is never approved directly — investigate and reject/dismiss it instead." },
        { status: 403 }
      );
    }
    const isAuthorized = approvalRoute.includes(input.actorRole) || input.actorRole === "controller";
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "not_authorized_for_role", detail: `This invoice routes to [${approvalRoute.join(", ") || "no one"}] — "${input.actorRole}" cannot approve it.` },
        { status: 403 }
      );
    }
    if (outcome === "blocked" && !input.comment) {
      return NextResponse.json(
        {
          error: "verification_note_required",
          detail: "Approving a blocked invoice requires a comment recording how it was verified out-of-band (CLAUDE.md section 12 bank-detail rules).",
        },
        { status: 400 }
      );
    }
  }

  const { data: actionRow, error: insertError } = await db
    .from("review_actions")
    .insert({
      invoice_id: id,
      action: input.action,
      actor_role: input.actorRole,
      actor_name: input.actorName,
      comment: input.comment ?? null,
      reassigned_to: input.action === "reassigned" ? input.reassignedTo : null,
    })
    .select("*")
    .single();

  if (insertError || !actionRow) {
    return NextResponse.json({ error: "insert_failed", message: insertError?.message }, { status: 500 });
  }

  const detail =
    input.action === "reassigned"
      ? `${input.actorName} (${input.actorRole}) reassigned this invoice to ${input.reassignedTo}.${input.comment ? ` "${input.comment}"` : ""}`
      : input.comment
        ? `${input.actorName} (${input.actorRole}): ${input.comment}`
        : `${input.actorName} (${input.actorRole}) recorded "${input.action}".`;

  await db.from("audit_events").insert({
    workflow_id: invoice.workflow_id,
    invoice_id: id,
    event_id: `${id}:review_action:${Date.now()}`,
    stage: "human_decision",
    label: `Invoice ${input.action}`,
    detail,
    actor: "human",
  });

  return NextResponse.json({ ok: true, action: actionRow });
}
