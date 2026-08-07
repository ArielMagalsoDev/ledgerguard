import type { Metadata } from "next";
import Link from "next/link";
import { getQueueItems, type QueueItem } from "@/lib/queue/queue-items";
import { OutcomeBadge } from "@/components/outcome-badge";
import { QueueRowActions } from "@/components/queue-row-actions";
import { QueueFilters } from "@/components/queue-filters";
import { OUTCOME_META } from "@/lib/outcome";
import { formatRoute } from "@/lib/route-labels";
import type { DecisionOutcome } from "@/lib/types";

export const metadata: Metadata = {
  title: "AP Review Queue — Ledger Guard",
  description: "Real invoices grouped by Ready, Exception, Duplicate Hold, and Blocked.",
};

// Server components can't take live traffic without a request — this page
// is dynamic (reads the DB on every load) so approve/reject actions are
// reflected immediately on the next render (`router.refresh()` from the
// client action component re-fetches this).
export const dynamic = "force-dynamic";

const GROUPS: DecisionOutcome[] = ["ready_for_approval", "exception_review", "duplicate_hold", "blocked"];

function ownerFromRoute(route: string[]): string {
  if (route.length === 0) return "AP review team";
  return formatRoute(route[0]);
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; property?: string }>;
}) {
  const params = await searchParams;
  const allItems = await getQueueItems();

  const suppliers = Array.from(new Set(allItems.map((i) => i.supplierName).filter((s): s is string => !!s))).sort();
  const properties = Array.from(
    new Map(allItems.filter((i) => i.propertyCode).map((i) => [i.propertyCode!, i.propertyName ?? i.propertyCode!])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const items = allItems.filter((i) => {
    if (params.supplier && i.supplierName !== params.supplier) return false;
    if (params.property && i.propertyCode !== params.property) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl font-semibold text-ink">AP review queue</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Every invoice that has actually been through extraction, matching, and the decision engine — real data, not
        fixtures. Approve, reject, reassign, or comment; every action is server-checked against the invoice&rsquo;s
        own approval route and recorded permanently.
      </p>

      {allItems.length === 0 && (
        <p className="mt-6 rounded border border-rule bg-paper-raised/50 px-4 py-3 text-sm text-ink-muted">
          No processed invoices yet — run <code className="font-tabular text-xs">npm run run-demo-pipeline</code> to
          populate the queue with the 5 guided-demo scenarios.
        </p>
      )}

      {allItems.length > 0 && <QueueFilters suppliers={suppliers} properties={properties} />}

      <div className="mt-8 space-y-10">
        {GROUPS.map((outcome) => {
          const meta = OUTCOME_META[outcome];
          const groupItems = items.filter((i) => i.outcome === outcome);
          if (groupItems.length === 0) return null;
          return (
            <section key={outcome}>
              <div className="mb-3 flex items-center gap-3 border-b border-rule-strong pb-2">
                <OutcomeBadge outcome={outcome} />
                <span className="font-tabular text-xs text-ink-faint">
                  {groupItems.length} invoice{groupItems.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="pb-2 pr-4 font-medium">Invoice</th>
                      <th className="pb-2 pr-4 font-medium">Amount</th>
                      <th className="pb-2 pr-4 font-medium">Reason</th>
                      <th className="pb-2 pr-4 font-medium">Owner</th>
                      <th className="pb-2 font-medium">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {groupItems.map((item) => (
                      <QueueRow key={item.invoiceId} item={item} />
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

function QueueRow({ item }: { item: QueueItem }) {
  return (
    <tr>
      <td className="min-w-0 py-3 pr-4 align-top">
        {item.scenarioKey ? (
          <Link
            href={`/demo?scenario=${item.scenarioKey}`}
            className="font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
          >
            {item.invoiceNumber ?? "—"}
          </Link>
        ) : (
          <span className="font-medium text-ink">{item.invoiceNumber ?? "—"}</span>
        )}
        <div className="truncate text-xs text-ink-faint">{item.supplierName ?? "Unknown supplier"}</div>
      </td>
      <td className="py-3 pr-4 align-top font-tabular text-ink">{item.total ? `$${item.total}` : "—"}</td>
      <td className="max-w-xs min-w-0 py-3 pr-4 align-top text-xs text-ink-muted">
        {item.reason.length > 140 ? item.reason.slice(0, 140) + "…" : item.reason}
      </td>
      <td className="py-3 pr-4 align-top text-xs text-ink-muted">{ownerFromRoute(item.approvalRoute)}</td>
      <td className="min-w-[280px] py-3 align-top">
        <QueueRowActions item={item} />
      </td>
    </tr>
  );
}
