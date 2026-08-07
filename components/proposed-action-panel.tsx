import { ShieldAlert } from "lucide-react";
import type { DemoScenario } from "@/lib/types";
import { OutcomeBadge } from "@/components/outcome-badge";
import { formatRoute } from "@/lib/route-labels";

export function ProposedActionPanel({ scenario }: { scenario: DemoScenario }) {
  const { decision } = scenario;
  return (
    <div className="card-paper space-y-4 p-5 sm:p-6">
      <div className="flex items-center justify-between border-b border-rule-strong pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Proposed action
        </span>
        <OutcomeBadge outcome={decision.outcome} size="sm" />
      </div>

      <p className="text-sm leading-relaxed text-ink">{decision.reason}</p>

      {decision.approvalRoute && decision.approvalRoute.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Routed to
          </h4>
          <ul className="mt-1.5 space-y-1">
            {decision.approvalRoute.map((role) => (
              <li key={role} className="text-sm text-ink-muted">
                → {formatRoute(role)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.requiredActions.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Required next actions
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {decision.requiredActions.map((action) => (
              <li key={action} className="flex gap-2 text-sm text-ink-muted">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-exception" aria-hidden />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Accounting-system change
        </h4>
        {decision.proposedAccountingChange ? (
          <div className="mt-2 rounded border border-rule-strong bg-paper p-3">
            <div className="flex items-center justify-between">
              <span className="font-tabular text-xs font-semibold uppercase tracking-wide text-ready">
                {decision.proposedAccountingChange.action.replace("_", " ")}
              </span>
              <span className="rounded bg-ready/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ready">
                Draft only — not posted
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-ink-faint">Cost center</dt>
              <dd className="font-tabular text-ink">{decision.proposedAccountingChange.costCenter}</dd>
              <dt className="text-ink-faint">Total</dt>
              <dd className="font-tabular text-ink">${decision.proposedAccountingChange.total}</dd>
              <dt className="text-ink-faint">Idempotency key</dt>
              <dd className="break-all font-tabular text-ink-muted">
                {decision.proposedAccountingChange.idempotencyKey}
              </dd>
            </dl>
          </div>
        ) : (
          <p className="mt-2 rounded border border-dashed border-rule-strong px-3 py-2 text-xs text-ink-muted">
            Withheld — no draft is created until this invoice reaches{" "}
            <span className="font-medium">ready for approval</span>.
          </p>
        )}
      </div>

      <p className="border-t border-rule pt-3 text-[11px] text-ink-faint">
        Policy version {decision.policyVersion} · workflow {decision.workflowId}. No
        payment is ever executed by this demo.
      </p>
    </div>
  );
}
