import type { Metadata } from "next";
import Link from "next/link";
import { SCENARIOS } from "@/lib/fixtures/scenarios";
import { OutcomeBadge } from "@/components/outcome-badge";
import { OUTCOME_META } from "@/lib/outcome";
import { formatRoute } from "@/lib/route-labels";
import type { DecisionOutcome } from "@/lib/types";

export const metadata: Metadata = {
  title: "AP Review Queue — LedgerGuard",
  description: "Fictional invoices grouped by Ready, Exception, Duplicate Hold, and Blocked.",
};

const GROUPS: DecisionOutcome[] = [
  "ready_for_approval",
  "exception_review",
  "duplicate_hold",
  "blocked",
];

function ownerFromRoute(route: string[] | undefined): string {
  if (!route || route.length === 0) return "AP review team";
  return formatRoute(route[0]);
}

export default function QueuePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl font-semibold text-ink">AP review queue</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        This preview seeds the queue with the 5 guided-demo invoices. A full
        queue — filtering by property, supplier, cost center, and risk, plus
        role-based approve/reassign/correct/reject actions — is Phase 6 work;
        see the project&rsquo;s <code className="font-tabular text-xs">CLAUDE.md</code>.
      </p>

      <div className="mt-10 space-y-10">
        {GROUPS.map((outcome) => {
          const meta = OUTCOME_META[outcome];
          const items = SCENARIOS.filter((s) => s.outcome === outcome);
          if (items.length === 0) return null;
          return (
            <section key={outcome}>
              <div className="mb-3 flex items-center gap-3 border-b border-rule-strong pb-2">
                <OutcomeBadge outcome={outcome} />
                <span className="font-tabular text-xs text-ink-faint">
                  {items.length} invoice{items.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="pb-2 pr-4 font-medium">Invoice</th>
                      <th className="pb-2 pr-4 font-medium">Amount</th>
                      <th className="pb-2 pr-4 font-medium">Reason</th>
                      <th className="pb-2 pr-4 font-medium">Owner</th>
                      <th className="pb-2 font-medium">Next action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {items.map((scenario) => (
                      <tr key={scenario.id}>
                        <td className="py-3 pr-4">
                          <Link
                            href={`/demo?scenario=${scenario.id}`}
                            className="font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
                          >
                            {scenario.extracted.invoiceNumber.value}
                          </Link>
                          <div className="text-xs text-ink-faint">{scenario.supplier.name}</div>
                        </td>
                        <td className="py-3 pr-4 font-tabular text-ink">
                          ${scenario.extracted.total.value}
                        </td>
                        <td className="max-w-xs py-3 pr-4 text-xs text-ink-muted">
                          {scenario.decision.reason.length > 100
                            ? scenario.decision.reason.slice(0, 100) + "…"
                            : scenario.decision.reason}
                        </td>
                        <td className="py-3 pr-4 text-xs text-ink-muted">
                          {ownerFromRoute(scenario.decision.approvalRoute)}
                        </td>
                        <td className="py-3 text-xs text-ink-muted">
                          {scenario.decision.requiredActions[0] ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs italic text-ink-faint">{meta.description}</p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
