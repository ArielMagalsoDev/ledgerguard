// Phase 6: the real AP review queue. Reads every invoice that has actually
// been through the decision pipeline (an inner join on `decisions` — the
// 24 seeded historical invoices exist only to power duplicate detection and
// were never decided, so they never appear here) plus the latest human
// review_actions row per invoice, if any.
import { supabaseAdmin } from "@/lib/supabase/server";
import type { DecisionOutcome } from "@/lib/types";

type Db = ReturnType<typeof supabaseAdmin>;

export type ReviewAction = "approved" | "rejected" | "reassigned" | "commented";

export type QueueItem = {
  invoiceId: string;
  workflowId: string;
  invoiceNumber: string | null;
  supplierName: string | null;
  total: string | null;
  outcome: DecisionOutcome;
  reason: string;
  approvalRoute: string[];
  requiredActions: string[];
  propertyCode: string | null;
  propertyName: string | null;
  scenarioKey: string | null;
  createdAt: string;
  latestResolution: {
    action: ReviewAction;
    actorRole: string;
    actorName: string;
    comment: string | null;
    reassignedTo: string | null;
    createdAt: string;
  } | null;
};

type QueueRow = {
  id: string;
  workflow_id: string;
  invoice_number: string | null;
  total: number | null;
  scenario_key: string | null;
  created_at: string;
  suppliers: { name: string } | null;
  purchase_orders: { property_code: string; properties: { name: string } | null } | null;
  decisions: {
    outcome: string;
    reason: string;
    approval_route: unknown;
    required_actions: unknown;
  } | null;
};

export async function getQueueItems(): Promise<QueueItem[]> {
  const db: Db = supabaseAdmin();

  const { data, error } = await db
    .from("invoices")
    .select(
      `id, workflow_id, invoice_number, total, scenario_key, created_at,
       suppliers ( name ),
       purchase_orders ( property_code, properties ( name ) ),
       decisions!inner ( outcome, reason, approval_route, required_actions )`
    )
    // sub_eval_* rows are eval-harness artifacts (evals/run.ts) — real
    // decided invoices, but not operationally-relevant queue items. Keeping
    // them out of the public queue is the same call already made for the
    // 24 seeded historical rows (which never get a decisions row at all).
    // source='upload' rows (the bring-your-own-invoice sandbox) get real
    // decisions too but are visitor-submitted, session-scoped, and expire
    // in 30 minutes — never operationally relevant to Keystone's own queue.
    .not("submission_id", "like", "sub_eval_%")
    .neq("source", "upload")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getQueueItems: failed to load invoices — ${error.message}`);

  const rows = (data ?? []) as unknown as QueueRow[];
  if (rows.length === 0) return [];

  const { data: actionRows, error: actionsError } = await db
    .from("review_actions")
    .select("*")
    .in("invoice_id", rows.map((r) => r.id))
    .order("created_at", { ascending: false });
  if (actionsError) throw new Error(`getQueueItems: failed to load review_actions — ${actionsError.message}`);

  const latestByInvoice = new Map<string, QueueItem["latestResolution"]>();
  for (const action of actionRows ?? []) {
    if (latestByInvoice.has(action.invoice_id)) continue; // already have the newest (rows are ordered desc)
    latestByInvoice.set(action.invoice_id, {
      action: action.action as ReviewAction,
      actorRole: action.actor_role,
      actorName: action.actor_name,
      comment: action.comment,
      reassignedTo: action.reassigned_to,
      createdAt: action.created_at,
    });
  }

  return rows
    .filter((r) => r.decisions != null)
    .map((r) => ({
      invoiceId: r.id,
      workflowId: r.workflow_id,
      invoiceNumber: r.invoice_number,
      supplierName: r.suppliers?.name ?? null,
      total: r.total != null ? String(r.total) : null,
      outcome: r.decisions!.outcome as DecisionOutcome,
      reason: r.decisions!.reason,
      approvalRoute: (r.decisions!.approval_route as string[] | null) ?? [],
      requiredActions: (r.decisions!.required_actions as string[] | null) ?? [],
      propertyCode: r.purchase_orders?.property_code ?? null,
      propertyName: r.purchase_orders?.properties?.name ?? null,
      scenarioKey: r.scenario_key,
      createdAt: r.created_at,
      latestResolution: latestByInvoice.get(r.id) ?? null,
    }));
}
