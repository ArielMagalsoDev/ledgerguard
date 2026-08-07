import type { Metadata } from "next";
import { BellRing } from "lucide-react";
import Link from "next/link";
import { getOperationsSnapshot } from "@/lib/operations/metrics";
import { OutcomeBadge } from "@/components/outcome-badge";
import { OUTCOME_META } from "@/lib/outcome";
import type { DecisionOutcome } from "@/lib/types";

export const metadata: Metadata = {
  title: "Operations — LedgerGuard",
  description: "Audit events, retries, latency, and cost.",
};

export const dynamic = "force-dynamic";

const ALERTS = [
  { title: "Critical bank-detail change detected", detail: "Fires the moment a bank_detail_change control fails — see Scenario 4." },
  { title: "Duplicate accounting write attempted", detail: "Fires if a replayed submissionId or idempotency key ever reaches the accounting integration." },
  { title: "OCR or model cost exceeds daily limit", detail: "Wired to the same race-safe daily spend-cap ledger used across the portfolio." },
];

const DEFERRED_ALERTS = [
  "Accounting-integration authentication failure",
  "Extraction-failure-rate threshold exceeded",
  "Monetary-correction-rate increase",
  "Exception-backlog SLA breach",
  "Workflow stuck beyond expected duration",
  "Evaluation regression crosses a release threshold",
];

const OPERATIONAL_CONTROLS = [
  "Pause accounting writes independently from extraction.",
  "Disable a failing OCR or model provider.",
  "Reprocess a workflow from its last successful stage.",
  "Version extraction prompts, schemas, rules, and models — display the version behind every decision.",
  "Replay dead-lettered jobs after remediation.",
  "Require dual approval to change critical controls (documented; single-operator in this demo).",
];

const NOT_YET_BUILT = [
  "Extraction confidence trended by field (needs a rolling baseline this project doesn't keep yet).",
  "Supplier and document-layout drift detection (same — needs historical trend data, not a single snapshot).",
];

function isDecisionOutcome(status: string): status is DecisionOutcome {
  return status in OUTCOME_META;
}

export default async function OperationsPage() {
  const m = await getOperationsSnapshot();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl font-semibold text-ink">Operations</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Real aggregates from every invoice the pipeline has actually processed — not the 5-scenario fixture sum this
        page started with.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card-paper p-4">
          <div className="font-display text-2xl font-semibold text-ink">{m.decidedInvoices}</div>
          <div className="text-xs text-ink-faint">Invoices decided</div>
        </div>
        <div className="card-paper p-4">
          <div className="font-display text-2xl font-semibold text-ink">{m.totalAuditEvents}</div>
          <div className="text-xs text-ink-faint">Audit events recorded</div>
        </div>
        <div className="card-paper p-4">
          <div className="font-display text-2xl font-semibold text-ink">{(m.totalLatencyMs / 1000).toFixed(1)}s</div>
          <div className="text-xs text-ink-faint">Total processing time</div>
        </div>
        <div className="card-paper p-4">
          <div className="font-display text-2xl font-semibold text-ink">${m.totalCostUsd.toFixed(3)}</div>
          <div className="text-xs text-ink-faint">Total model cost</div>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold text-ink">Invoices by state</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {m.invoicesByStatus.map((row) => (
            <div key={row.status} className="card-paper flex items-center gap-2 px-3 py-2">
              <span className="font-tabular text-lg font-semibold text-ink">{row.count}</span>
              <span className="text-xs text-ink-faint">{row.status.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          {m.totalInvoices} total invoice row(s) — {m.totalInvoices - m.decidedInvoices} are seeded historical/duplicate-detection
          data that never entered the decision pipeline (see /queue).
        </p>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-strong pb-2">
          <h2 className="font-display text-xl font-semibold text-ink">Duplicate detection &amp; approval backlog</h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card-paper p-4">
            <div className="font-display text-xl font-semibold text-ink">
              {m.duplicateHoldsConfirmed} / {m.duplicateCandidatesFound}
            </div>
            <div className="text-xs text-ink-faint">Confirmed duplicate holds / invoices with any candidate signal</div>
          </div>
          <div className="card-paper p-4">
            <div className="font-display text-xl font-semibold text-ink">{(m.humanCorrectionRate * 100).toFixed(0)}%</div>
            <div className="text-xs text-ink-faint">Human correction rate (decided invoices with a field correction)</div>
          </div>
          <div className="card-paper p-4">
            <div className="font-display text-xl font-semibold text-ink">{m.approvalBacklog.length}</div>
            <div className="text-xs text-ink-faint">Open in the approval backlog right now</div>
          </div>
        </div>
        {m.approvalBacklog.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Invoice</th>
                  <th className="pb-2 pr-4 font-medium">Outcome</th>
                  <th className="pb-2 text-right font-medium">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {m.approvalBacklog.slice(0, 10).map((b) => (
                  <tr key={b.invoiceId}>
                    <td className="py-2 pr-4">
                      <Link href="/queue" className="font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
                        {b.invoiceNumber ?? b.invoiceId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{isDecisionOutcome(b.outcome) && <OutcomeBadge outcome={b.outcome} size="sm" />}</td>
                    <td className="py-2 text-right font-tabular text-ink-muted">{b.ageHours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {m.exceptionsByControl.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold text-ink">Exception frequency by control</h2>
          <div className="mt-4 space-y-2">
            {m.exceptionsByControl.map((c) => (
              <div key={c.controlId} className="flex items-center justify-between gap-3 border-b border-rule pb-2 text-sm">
                <span className="text-ink-muted">{c.label}</span>
                <span className="font-tabular font-medium text-ink">{c.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold text-ink">Integration health</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="card-paper p-4">
            <div className="font-display text-xl font-semibold text-ink">{m.accountingCreated}</div>
            <div className="text-xs text-ink-faint">Draft bills created (QuickBooks)</div>
          </div>
          <div className="card-paper p-4">
            <div className="font-display text-xl font-semibold text-ink">{m.accountingFailures}</div>
            <div className="text-xs text-ink-faint">Accounting-write failures</div>
          </div>
          <div className="card-paper p-4">
            <div className="font-display text-xl font-semibold text-ink">{m.jobFailures.transient}</div>
            <div className="text-xs text-ink-faint">Jobs retrying (transient failure)</div>
          </div>
          <div className="card-paper p-4">
            <div className="font-display text-xl font-semibold text-ink">{m.jobFailures.permanent}</div>
            <div className="text-xs text-ink-faint">Jobs dead-lettered (permanent failure)</div>
          </div>
        </div>
      </section>

      {m.perInvoice.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold text-ink">Per-invoice summary</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Invoice</th>
                  <th className="pb-2 pr-4 font-medium">Outcome</th>
                  <th className="pb-2 pr-4 text-right font-medium">Events</th>
                  <th className="pb-2 pr-4 text-right font-medium">Latency</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {m.perInvoice.slice(0, 25).map((s) => (
                  <tr key={s.invoiceId}>
                    <td className="py-2.5 pr-4 font-tabular text-ink">{s.invoiceNumber ?? s.workflowId.slice(0, 8)}</td>
                    <td className="py-2.5 pr-4">{isDecisionOutcome(s.outcome) && <OutcomeBadge outcome={s.outcome} size="sm" />}</td>
                    <td className="py-2.5 pr-4 text-right font-tabular text-ink-muted">{s.events}</td>
                    <td className="py-2.5 pr-4 text-right font-tabular text-ink-muted">{(s.latencyMs / 1000).toFixed(1)}s</td>
                    <td className="py-2.5 text-right font-tabular text-ink-muted">${s.costUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.perInvoice.length > 25 && (
            <p className="mt-2 text-xs text-ink-faint">Showing the 25 most recent of {m.perInvoice.length} decided invoices.</p>
          )}
        </section>
      )}

      <section className="mt-14">
        <h2 className="font-display text-xl font-semibold text-ink">Alerts — live in v1</h2>
        <ul className="mt-4 space-y-3">
          {ALERTS.map((alert) => (
            <li key={alert.title} className="flex gap-3">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-blocked" aria-hidden />
              <div>
                <div className="text-sm font-medium text-ink">{alert.title}</div>
                <div className="text-xs text-ink-muted">{alert.detail}</div>
              </div>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Production-documented, not built in v1
        </h3>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {DEFERRED_ALERTS.map((a) => (
            <li key={a} className="text-xs text-ink-faint">
              · {a}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-xl font-semibold text-ink">Operational controls</h2>
        <ul className="mt-4 space-y-2">
          {OPERATIONAL_CONTROLS.map((c) => (
            <li key={c} className="flex gap-2.5 text-sm text-ink-muted">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
              {c}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 mb-8">
        <h2 className="font-display text-xl font-semibold text-ink">Not yet built on this dashboard</h2>
        <ul className="mt-4 space-y-2">
          {NOT_YET_BUILT.map((c) => (
            <li key={c} className="flex gap-2.5 text-sm text-ink-muted">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
              {c}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
