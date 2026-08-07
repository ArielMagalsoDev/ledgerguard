import type { InvoiceDocumentLine } from "@/lib/types";

const KIND_CLASS: Record<InvoiceDocumentLine["kind"], string> = {
  header: "font-display text-base font-semibold text-ink",
  meta: "font-tabular text-[13px] text-ink-muted",
  "table-header": "font-tabular text-[11px] uppercase tracking-wide text-ink-faint border-b border-rule-strong pb-1 mt-2",
  "line-item": "font-tabular text-[13px] text-ink",
  totals: "font-tabular text-[13px] text-ink text-right",
  notes: "text-[13px] italic text-ink-muted",
  footer: "text-[11px] text-ink-faint",
};

export function InvoiceDocument({
  lines,
  highlightText,
  flaggedLineIds = [],
}: {
  lines: InvoiceDocumentLine[];
  highlightText?: string | null;
  flaggedLineIds?: string[];
}) {
  return (
    <div className="card-paper p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between border-b border-rule-strong pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Source document — page 1
        </span>
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">
          Rendered from extracted text
        </span>
      </div>
      <div className="space-y-1.5">
        {lines.map((line) => {
          const isHighlighted =
            !!highlightText && line.text.includes(highlightText);
          const isFlagged = flaggedLineIds.includes(line.id);
          return (
            <p
              key={line.id}
              className={[
                KIND_CLASS[line.kind],
                "rounded px-1.5 py-0.5 transition-colors",
                isHighlighted ? "bg-[var(--ready-bg)] ring-1 ring-ready/40" : "",
                isFlagged && !isHighlighted
                  ? "bg-[var(--exception-bg)] ring-1 ring-exception/40"
                  : "",
              ].join(" ")}
            >
              {line.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}
