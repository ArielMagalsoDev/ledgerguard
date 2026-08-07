"use client";

import { AlertCircle, CircleHelp, CircleSlash, CircleCheck } from "lucide-react";
import type { ExtractedField, ExtractedInvoice, FieldStatus } from "@/lib/types";

const STATUS_META: Record<FieldStatus, { icon: typeof CircleCheck; color: string; label: string }> = {
  verified: { icon: CircleCheck, color: "var(--ready)", label: "Verified" },
  uncertain: { icon: CircleHelp, color: "var(--exception)", label: "Uncertain" },
  conflicting: { icon: AlertCircle, color: "var(--blocked)", label: "Conflicting" },
  missing: { icon: CircleSlash, color: "var(--ink-faint)", label: "Missing" },
};

const HEADER_LABELS: Record<string, string> = {
  invoiceNumber: "Invoice number",
  invoiceDate: "Invoice date",
  dueDate: "Due date",
  supplierName: "Supplier name",
  supplierTaxId: "Supplier tax ID",
  purchaseOrderNumber: "PO number",
  currency: "Currency",
  subtotal: "Subtotal",
  tax: "Tax",
  total: "Total",
  remittanceDetails: "Remittance details",
  notes: "Notes (untrusted)",
};

const HEADER_ORDER: (keyof ExtractedInvoice)[] = [
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "supplierName",
  "supplierTaxId",
  "purchaseOrderNumber",
  "currency",
  "subtotal",
  "tax",
  "total",
  "remittanceDetails",
  "notes",
];

function FieldRow({
  label,
  field,
  selected,
  onSelect,
}: {
  label: string;
  field: ExtractedField<string>;
  selected: boolean;
  onSelect: (text: string | null) => void;
}) {
  const meta = STATUS_META[field.status];
  const Icon = meta.icon;
  const evidenceText = field.evidence[0]?.text;
  const isMoney = ["subtotal", "tax", "total"].includes(field.field);

  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? null : evidenceText ?? null)}
      disabled={!evidenceText}
      className={[
        "flex w-full items-start gap-2.5 rounded px-2 py-2 text-left transition-colors",
        evidenceText ? "cursor-pointer hover:bg-ink/5" : "cursor-default",
        selected ? "bg-[var(--ready-bg)] ring-1 ring-ready/40" : "",
      ].join(" ")}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
          <span className="shrink-0 text-[10px] text-ink-faint">
            {Math.round(field.confidence * 100)}%
          </span>
        </div>
        <div
          className={
            isMoney
              ? "font-tabular text-sm text-ink"
              : field.field === "notes"
                ? "text-sm italic text-ink-muted break-words"
                : "font-tabular text-sm text-ink break-words"
          }
        >
          {field.value ?? <span className="italic text-ink-faint">not present</span>}
        </div>
      </div>
    </button>
  );
}

export function ExtractedDataPanel({
  extracted,
  selectedText,
  onSelect,
}: {
  extracted: ExtractedInvoice;
  selectedText: string | null;
  onSelect: (text: string | null) => void;
}) {
  return (
    <div className="card-paper p-5 sm:p-6">
      <div className="mb-3 border-b border-rule-strong pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Extracted data
        </span>
      </div>
      <div className="divide-y divide-rule">
        {HEADER_ORDER.map((key) => {
          const field = extracted[key] as ExtractedField<string> | undefined;
          if (!field) return null;
          const evidenceText = field.evidence[0]?.text;
          return (
            <FieldRow
              key={key}
              label={HEADER_LABELS[key]}
              field={field}
              selected={!!evidenceText && evidenceText === selectedText}
              onSelect={onSelect}
            />
          );
        })}
      </div>

      <div className="mt-4 border-t border-rule-strong pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Line items ({extracted.lineItems.length})
        </span>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-ink-faint">
                <th className="pb-1.5 pr-2 font-medium">Description</th>
                <th className="pb-1.5 pr-2 text-right font-medium">Qty</th>
                <th className="pb-1.5 pr-2 text-right font-medium">Unit price</th>
                <th className="pb-1.5 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {extracted.lineItems.map((line) => {
                const evidenceText = line.description.evidence[0]?.text;
                const isSelected = !!evidenceText && evidenceText === selectedText;
                return (
                  <tr
                    key={line.lineNumber}
                    onClick={() => onSelect(isSelected ? null : evidenceText ?? null)}
                    className={[
                      "cursor-pointer transition-colors hover:bg-ink/5",
                      isSelected ? "bg-[var(--ready-bg)]" : "",
                    ].join(" ")}
                  >
                    <td className="py-1.5 pr-2 text-ink">{line.description.value}</td>
                    <td className="py-1.5 pr-2 text-right font-tabular text-ink-muted">
                      {line.quantity.value}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-tabular text-ink-muted">
                      ${line.unitPrice.value}
                    </td>
                    <td className="py-1.5 text-right font-tabular text-ink">
                      ${line.lineTotal.value}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
