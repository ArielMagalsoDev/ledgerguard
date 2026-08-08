import type { Metadata } from "next";
import Link from "next/link";
import { getQueueItems, type QueueItem } from "@/lib/queue/queue-items";
import { OutcomeBadge } from "@/components/outcome-badge";
import { QueueRowActions } from "@/components/queue-row-actions";
import { QueueFilters } from "@/components/queue-filters";
import { OUTCOME_META } from "@/lib/outcome";
import { formatRoute } from "@/lib/route-labels";
import type { DecisionOutcome } from "@/lib/types";
import { PageHero } from "@/components/page-hero";
import { RecruiterProof } from "@/components/recruiter-proof";

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

  const exceptionCount = allItems.filter((item) => item.outcome === "exception_review").length;
  const holdCount = allItems.filter((item) => item.outcome === "duplicate_hold" || item.outcome === "blocked").length;

  return (
    <div>
      <PageHero
        eyebrow="Human review and approval control"
        title={<>The AI prepares the work. <span className="text-accent">People retain authority.</span></>}
        description={<>Every invoice here passed through extraction, matching, and the decision engine. Approvals, rejections, reassignment, and comments are server-checked against the invoice&rsquo;s route and recorded permanently.</>}
        actions={
          <>
            <Link href="/demo" className="btn-pill btn-pill-primary">Inspect a scenario</Link>
            <Link href="/operations" className="btn-pill btn-pill-outline">View operations</Link>
          </>
        }
        aside={
          <div className="grid grid-cols-3 gap-5 text-left lg:text-right">
            <div><strong className="block font-display text-3xl font-normal text-ink">{allItems.length}</strong><span className="text-xs text-ink-faint">open items</span></div>
            <div><strong className="block font-display text-3xl font-normal text-exception">{exceptionCount}</strong><span className="text-xs text-ink-faint">exceptions</span></div>
            <div><strong className="block font-display text-3xl font-normal text-blocked">{holdCount}</strong><span className="text-xs text-ink-faint">holds / blocks</span></div>
          </div>
        }
      />

      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-marker">(Live approval backlog)</p>
            <h2 className="mt-2 font-display text-2xl font-normal text-ink">AP review queue</h2>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-ink-faint sm:text-right">Role checks and required verification notes are enforced on the server, not trusted from the interface.</p>
        </div>

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

      <RecruiterProof
        title="Human review is a product capability, not a disclaimer."
        description="The queue demonstrates approval routing, separation of duties, verification requirements, durable comments, and audit history around model-assisted work."
      />
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
