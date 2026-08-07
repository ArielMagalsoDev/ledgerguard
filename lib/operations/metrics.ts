// Phase 7: live monitoring data for /operations — real Postgres aggregates,
// not the 5-scenario fixture sum this page started with. Scoped to what's
// actually computable from what the pipeline writes today; "extraction
// confidence by field" and "supplier/layout drift" need a trend baseline
// this project doesn't have yet and are stated as gaps, not silently
// dropped — same honesty pattern as the rest of this codebase.
import { supabaseAdmin } from "@/lib/supabase/server";

type Db = ReturnType<typeof supabaseAdmin>;

export type OperationsSnapshot = {
  totalInvoices: number;
  decidedInvoices: number;
  totalAuditEvents: number;
  totalLatencyMs: number;
  totalCostUsd: number;
  invoicesByStatus: Array<{ status: string; count: number }>;
  perInvoice: Array<{
    invoiceId: string;
    workflowId: string;
    invoiceNumber: string | null;
    outcome: string;
    events: number;
    latencyMs: number;
    costUsd: number;
  }>;
  exceptionsByControl: Array<{ controlId: string; label: string; count: number }>;
  duplicateCandidatesFound: number;
  duplicateHoldsConfirmed: number;
  approvalBacklog: Array<{ invoiceId: string; invoiceNumber: string | null; outcome: string; ageHours: number }>;
  humanCorrectionRate: number; // 0..1, of decided invoices
  jobFailures: { transient: number; permanent: number };
  accountingFailures: number;
  accountingCreated: number;
};

export async function getOperationsSnapshot(): Promise<OperationsSnapshot> {
  const db: Db = supabaseAdmin();

  const [
    { count: totalInvoices },
    { data: statusRows },
    { data: auditRows },
    { data: decisionInvoiceRows },
    { data: controlFailRows },
    { data: matchRows },
    { data: correctedRows },
    { data: jobRows },
    { data: acctRows },
  ] = await Promise.all([
    db.from("invoices").select("id", { count: "exact", head: true }),
    db.from("invoices").select("status"),
    db.from("audit_events").select("invoice_id, workflow_id, stage, latency_ms, cost_usd"),
    db
      .from("invoices")
      .select("id, workflow_id, invoice_number, created_at, decisions!inner(outcome)")
      .order("created_at", { ascending: false }),
    db.from("controls").select("control_id, label").in("status", ["failed", "warning"]),
    db.from("match_results").select("duplicate_candidates"),
    db.from("audit_events").select("invoice_id").eq("stage", "field_corrected"),
    db.from("jobs").select("status"),
    db.from("accounting_bills").select("status"),
  ]);

  const statusCounts = new Map<string, number>();
  for (const row of statusRows ?? []) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }

  const totalAuditEvents = (auditRows ?? []).length;
  const totalLatencyMs = (auditRows ?? []).reduce((sum, e) => sum + (e.latency_ms ?? 0), 0);
  const totalCostUsd = (auditRows ?? []).reduce((sum, e) => sum + (e.cost_usd ?? 0), 0);

  const byInvoice = new Map<string, { events: number; latencyMs: number; costUsd: number }>();
  for (const e of auditRows ?? []) {
    if (!e.invoice_id) continue;
    const agg = byInvoice.get(e.invoice_id) ?? { events: 0, latencyMs: 0, costUsd: 0 };
    agg.events += 1;
    agg.latencyMs += e.latency_ms ?? 0;
    agg.costUsd += e.cost_usd ?? 0;
    byInvoice.set(e.invoice_id, agg);
  }

  type DecisionRow = { id: string; workflow_id: string; invoice_number: string | null; created_at: string; decisions: { outcome: string } | null };
  const decided = (decisionInvoiceRows ?? []) as unknown as DecisionRow[];

  const perInvoice = decided.map((r) => {
    const agg = byInvoice.get(r.id) ?? { events: 0, latencyMs: 0, costUsd: 0 };
    return {
      invoiceId: r.id,
      workflowId: r.workflow_id,
      invoiceNumber: r.invoice_number,
      outcome: r.decisions?.outcome ?? "unknown",
      events: agg.events,
      latencyMs: agg.latencyMs,
      costUsd: agg.costUsd,
    };
  });

  const controlCounts = new Map<string, { label: string; count: number }>();
  for (const c of controlFailRows ?? []) {
    const existing = controlCounts.get(c.control_id);
    if (existing) existing.count += 1;
    else controlCounts.set(c.control_id, { label: c.label, count: 1 });
  }
  const exceptionsByControl = Array.from(controlCounts.entries())
    .map(([controlId, v]) => ({ controlId, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const duplicateCandidatesFound = (matchRows ?? []).filter((m) => Array.isArray(m.duplicate_candidates) && (m.duplicate_candidates as unknown[]).length > 0).length;
  const duplicateHoldsConfirmed = decided.filter((r) => r.decisions?.outcome === "duplicate_hold").length;

  const correctedInvoiceIds = new Set((correctedRows ?? []).map((r) => r.invoice_id).filter(Boolean));
  const humanCorrectionRate = decided.length > 0 ? correctedInvoiceIds.size / decided.length : 0;

  const jobFailures = {
    transient: (jobRows ?? []).filter((j) => j.status === "failed_transient").length,
    permanent: (jobRows ?? []).filter((j) => j.status === "failed_permanent").length,
  };

  const accountingFailures = (acctRows ?? []).filter((a) => a.status === "failed").length;
  const accountingCreated = (acctRows ?? []).filter((a) => a.status === "created").length;

  // Approval backlog: decided invoices whose outcome still needs a human call
  // (everything but duplicate_hold, which routes to investigation, not
  // approval) and that have no terminal review_actions row yet.
  const pendingOutcomes = new Set(["ready_for_approval", "exception_review", "blocked"]);
  const pendingCandidates = decided.filter((r) => r.decisions && pendingOutcomes.has(r.decisions.outcome));
  const { data: terminalActions } = pendingCandidates.length
    ? await db
        .from("review_actions")
        .select("invoice_id, action")
        .in(
          "invoice_id",
          pendingCandidates.map((r) => r.id)
        )
        .in("action", ["approved", "rejected"])
    : { data: [] as Array<{ invoice_id: string; action: string }> };
  const resolvedIds = new Set((terminalActions ?? []).map((a) => a.invoice_id));
  const now = Date.now();
  const approvalBacklog = pendingCandidates
    .filter((r) => !resolvedIds.has(r.id))
    .map((r) => ({
      invoiceId: r.id,
      invoiceNumber: r.invoice_number,
      outcome: r.decisions!.outcome,
      ageHours: (now - new Date(r.created_at).getTime()) / 3_600_000,
    }))
    .sort((a, b) => b.ageHours - a.ageHours);

  return {
    totalInvoices: totalInvoices ?? 0,
    decidedInvoices: decided.length,
    totalAuditEvents,
    totalLatencyMs,
    totalCostUsd,
    invoicesByStatus: Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count })),
    perInvoice,
    exceptionsByControl,
    duplicateCandidatesFound,
    duplicateHoldsConfirmed,
    approvalBacklog,
    humanCorrectionRate,
    jobFailures,
    accountingFailures,
    accountingCreated,
  };
}
