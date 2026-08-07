import type { DecisionOutcome } from "@/lib/types";

export const OUTCOME_META: Record<
  DecisionOutcome,
  { label: string; short: string; color: string; bg: string; description: string }
> = {
  ready_for_approval: {
    label: "Ready for approval",
    short: "Ready",
    color: "var(--ready)",
    bg: "var(--ready-bg)",
    description: "Extraction complete, arithmetic valid, supplier and PO match, no duplicate, tolerances pass.",
  },
  exception_review: {
    label: "Exception review",
    short: "Exception",
    color: "var(--exception)",
    bg: "var(--exception-bg)",
    description: "Legitimate-looking invoice with a price, quantity, tax, receipt, or documentation exception.",
  },
  duplicate_hold: {
    label: "Duplicate hold",
    short: "Duplicate",
    color: "var(--duplicate)",
    bg: "var(--duplicate-bg)",
    description: "Exact or probable duplicate evidence — requires AP investigation before anything else happens.",
  },
  blocked: {
    label: "Blocked",
    short: "Blocked",
    color: "var(--blocked)",
    bg: "var(--blocked-bg)",
    description: "Supplier identity, bank details, file safety, or required fields fail a high-risk control.",
  },
};
