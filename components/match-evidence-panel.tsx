import type { DemoScenario, MatchTier, PoMatchTier } from "@/lib/types";

const TIER_COLOR: Record<MatchTier | PoMatchTier, string> = {
  exact: "var(--ready)",
  partial: "var(--exception)",
  probable: "var(--exception)",
  ambiguous: "var(--exception)",
  none: "var(--ink-faint)",
};

function TierBadge({ tier }: { tier: MatchTier | PoMatchTier }) {
  const color = TIER_COLOR[tier];
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color, backgroundColor: `${color}1a` }}
    >
      {tier}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
      {children}
    </h3>
  );
}

export function MatchEvidencePanel({ scenario }: { scenario: DemoScenario }) {
  const { supplier, purchaseOrder, receipt, duplicateOf, match, extracted } = scenario;

  return (
    <div className="card-paper space-y-5 p-5 sm:p-6">
      <div className="border-b border-rule-strong pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Match evidence
        </span>
      </div>

      {/* Supplier */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <SectionHeading>Supplier identity</SectionHeading>
          <TierBadge tier={match.supplierMatch} />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="text-ink-faint">Invoice tax ID</div>
          <div className="text-ink-faint">Approved master</div>
          <div className="font-tabular text-ink">{extracted.supplierTaxId.value}</div>
          <div className="font-tabular text-ink">{supplier.taxId}</div>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {supplier.name} · approved supplier since evidence on file, status{" "}
          <span className="font-medium">{supplier.status}</span>.
        </p>
      </div>

      {/* Purchase order */}
      {purchaseOrder ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <SectionHeading>Purchase order — {purchaseOrder.number}</SectionHeading>
            <TierBadge tier={match.purchaseOrderMatch} />
          </div>
          <p className="mb-2 text-xs text-ink-muted">
            {purchaseOrder.property} · not-to-exceed ${purchaseOrder.notToExceed} ·
            status {purchaseOrder.status}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px] text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-ink-faint">
                  <th className="pb-1 pr-2 font-medium">Line</th>
                  <th className="pb-1 pr-2 text-right font-medium">Approved qty</th>
                  <th className="pb-1 text-right font-medium">Approved price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {purchaseOrder.lines.map((line) => {
                  const invoiceLine = extracted.lineItems.find(
                    (li) => li.description.value === line.description
                  );
                  const priceDiffers =
                    invoiceLine && invoiceLine.unitPrice.value !== line.unitPrice;
                  const qtyDiffers =
                    invoiceLine &&
                    Number(invoiceLine.quantity.value) !== line.approvedQuantity;
                  return (
                    <tr key={line.description}>
                      <td className="py-1 pr-2 text-ink">{line.description}</td>
                      <td
                        className={`py-1 pr-2 text-right font-tabular ${qtyDiffers ? "font-semibold text-blocked" : "text-ink-muted"}`}
                      >
                        {line.approvedQuantity}
                      </td>
                      <td
                        className={`py-1 text-right font-tabular ${priceDiffers ? "font-semibold text-blocked" : "text-ink-muted"}`}
                      >
                        ${line.unitPrice}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!purchaseOrder.lines.find(
            (l) => l.description === extracted.lineItems[extracted.lineItems.length - 1]?.description.value
          ) &&
            extracted.lineItems.length > purchaseOrder.lines.length && (
              <p className="mt-2 rounded bg-[var(--exception-bg)] px-2 py-1.5 text-xs text-exception">
                {extracted.lineItems.length - purchaseOrder.lines.length} invoice line(s)
                have no corresponding PO line.
              </p>
            )}
        </div>
      ) : (
        <div>
          <SectionHeading>Purchase order</SectionHeading>
          <p className="mt-2 text-xs text-ink-muted">
            No PO reference — matched as a recurring non-PO service category
            instead.
          </p>
        </div>
      )}

      {/* Receipt */}
      {receipt ? (
        <div>
          <SectionHeading>Goods / service receipt</SectionHeading>
          <p className="mt-2 text-xs text-ink-muted">
            {receipt.id} · received {receipt.receivedDate} by {receipt.receivedBy} ·
            confirms {receipt.lines.length} line(s)
          </p>
        </div>
      ) : null}

      {/* Duplicates */}
      <div>
        <SectionHeading>Duplicate candidates</SectionHeading>
        {match.duplicateCandidates.length === 0 ? (
          <p className="mt-2 text-xs text-ink-muted">None found.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {match.duplicateCandidates.map((candidate) => (
              <div
                key={candidate.existingInvoiceId}
                className="rounded border border-blocked/30 bg-[var(--blocked-bg)] p-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-tabular text-xs font-semibold text-blocked">
                    {candidate.existingInvoiceId}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-blocked">
                    {candidate.matchType} match
                  </span>
                </div>
                {duplicateOf && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Recorded {duplicateOf.recordedAt.slice(0, 10)} from{" "}
                    <span className="font-tabular">{duplicateOf.originalFileName}</span>
                  </p>
                )}
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {candidate.matchedSignals.map((signal) => (
                    <li
                      key={signal}
                      className="rounded bg-blocked/10 px-1.5 py-0.5 font-tabular text-[10px] text-blocked"
                    >
                      {signal}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
