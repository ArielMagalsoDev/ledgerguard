import type { Metadata } from "next";
import { BellRing } from "lucide-react";
import { SCENARIOS } from "@/lib/fixtures/scenarios";
import { OutcomeBadge } from "@/components/outcome-badge";

export const metadata: Metadata = {
  title: "Operations — LedgerGuard",
  description: "Audit events, retries, latency, and cost.",
};

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

export default function OperationsPage() {
  const totalLatencyMs = SCENARIOS.flatMap((s) => s.auditEvents).reduce(
    (sum, e) => sum + (e.latencyMs ?? 0),
    0
  );
  const totalCostUsd = SCENARIOS.flatMap((s) => s.auditEvents).reduce(
    (sum, e) => sum + (e.costUsd ?? 0),
    0
  );
  const totalEvents = SCENARIOS.flatMap((s) => s.auditEvents).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl font-semibold text-ink">Operations</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Aggregated from the 5 guided-demo workflows. A live dashboard over real
        traffic — volume by supplier/property, confidence drift, approval
        backlog aging — is Phase 6+ work.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card-paper p-4">
          <div className="font-display text-2xl font-semibold text-ink">{SCENARIOS.length}</div>
          <div className="text-xs text-ink-faint">Workflows run</div>
        </div>
        <div className="card-paper p-4">
          <div className="font-display text-2xl font-semibold text-ink">{totalEvents}</div>
          <div className="text-xs text-ink-faint">Audit events recorded</div>
        </div>
        <div className="card-paper p-4">
          <div className="font-display text-2xl font-semibold text-ink">
            {(totalLatencyMs / 1000).toFixed(1)}s
          </div>
          <div className="text-xs text-ink-faint">Total processing time</div>
        </div>
        <div className="card-paper p-4">
          <div className="font-display text-2xl font-semibold text-ink">
            ${totalCostUsd.toFixed(3)}
          </div>
          <div className="text-xs text-ink-faint">Total model cost</div>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold text-ink">Per-workflow summary</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-4 font-medium">Workflow</th>
                <th className="pb-2 pr-4 font-medium">Outcome</th>
                <th className="pb-2 pr-4 text-right font-medium">Events</th>
                <th className="pb-2 pr-4 text-right font-medium">Latency</th>
                <th className="pb-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {SCENARIOS.map((s) => {
                const latency = s.auditEvents.reduce((sum, e) => sum + (e.latencyMs ?? 0), 0);
                const cost = s.auditEvents.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
                return (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 font-tabular text-ink">{s.decision.workflowId}</td>
                    <td className="py-2.5 pr-4">
                      <OutcomeBadge outcome={s.outcome} size="sm" />
                    </td>
                    <td className="py-2.5 pr-4 text-right font-tabular text-ink-muted">
                      {s.auditEvents.length}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-tabular text-ink-muted">
                      {(latency / 1000).toFixed(1)}s
                    </td>
                    <td className="py-2.5 text-right font-tabular text-ink-muted">
                      ${cost.toFixed(4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

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

      <section className="mt-14 mb-8">
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
    </div>
  );
}
