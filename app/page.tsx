import Link from "next/link";
import {
  ArrowRight,
  Fingerprint,
  ScanSearch,
  ShieldCheck,
  Split,
} from "lucide-react";
import { OutcomeBadge } from "@/components/outcome-badge";
import { ImpactCalculator } from "@/components/impact-calculator";
import { OUTCOME_META } from "@/lib/outcome";
import type { DecisionOutcome } from "@/lib/types";

const PROOF_POINTS = [
  {
    icon: ScanSearch,
    title: "Source-linked fields",
    body: "Every extracted value — every date, every dollar — links back to the exact text it came from. Nothing is asserted without evidence.",
  },
  {
    icon: Split,
    title: "Three-way matching",
    body: "Invoice, purchase order, and receipt are compared line by line. A mismatch anywhere in the chain becomes a visible exception, not a silent guess.",
  },
  {
    icon: Fingerprint,
    title: "Duplicate prevention",
    body: "Identity-based matching — supplier, invoice number, date, amount — catches renamed rescans that file-hash comparison alone would miss.",
  },
  {
    icon: ShieldCheck,
    title: "Controlled approvals",
    body: "Deterministic code decides what qualifies for automatic routing. Bank-detail changes are always held for out-of-band human verification.",
  },
];

const OUTCOME_ORDER: DecisionOutcome[] = [
  "ready_for_approval",
  "exception_review",
  "duplicate_hold",
  "blocked",
];

const TRILOGY = [
  {
    name: "Meridian Assist",
    role: "Customer support",
    proof: "RAG, citations, claim verification, refusal, escalation",
  },
  {
    name: "SignalDesk",
    role: "Revenue operations",
    proof: "Enrichment, identity resolution, deterministic scoring, CRM safety",
  },
  {
    name: "LedgerSentry",
    role: "Finance operations",
    proof: "Document extraction, financial controls, matching, approvals, accounting integration",
    current: true,
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pt-24">
        <p className="font-tabular text-xs uppercase tracking-[0.18em] text-ink-faint">
          AI invoice-exception automation
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Prepare routine invoices without guessing at financial data.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
          LedgerSentry extracts invoice data with visible evidence, recalculates
          every amount with deterministic code, matches suppliers and purchase
          orders, and routes exceptions to the right approver — never to a model&rsquo;s
          best guess. It never authorizes a payment on its own.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded bg-ink px-5 py-2.5 text-sm font-medium text-paper-raised transition-opacity hover:opacity-90"
          >
            Run the guided AP workflow
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/evals"
            className="inline-flex items-center gap-2 rounded border border-rule-strong px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/5"
          >
            View control evaluations
          </Link>
        </div>
      </section>

      {/* Proof points */}
      <section className="border-y border-rule bg-paper-raised/40">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {PROOF_POINTS.map((point) => (
            <div key={point.title}>
              <point.icon className="h-5 w-5 text-ready" aria-hidden />
              <h3 className="mt-3 font-display text-base font-semibold text-ink">
                {point.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {point.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Four outcomes */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Every invoice ends in one of four states
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          There is no fifth state where the model decides on its own that
          something is probably fine. The public demo may simulate approval
          and accounting writes — it never presents &ldquo;paid&rdquo; as an outcome.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OUTCOME_ORDER.map((outcome) => {
            const meta = OUTCOME_META[outcome];
            return (
              <div key={outcome} className="card-paper p-5">
                <OutcomeBadge outcome={outcome} size="sm" />
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  {meta.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Impact calculator */}
      <section className="border-y border-rule bg-paper-raised/40">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <h2 className="font-display text-2xl font-semibold text-ink">
            Illustrative business impact
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            For a fictional multi-property facilities operator processing
            thousands of invoices a month. Adjust the assumptions — the math
            updates live.
          </p>
          <div className="mt-8">
            <ImpactCalculator />
          </div>
        </div>
      </section>

      {/* Trilogy fit */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Part of a three-project portfolio
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Knowledge work, sales operations, and document-heavy financial
          processes — each automated with human review, deterministic
          controls, evaluations, and integrations applied appropriately.
        </p>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-rule-strong text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-4 font-medium">Project</th>
                <th className="pb-2 pr-4 font-medium">Business function</th>
                <th className="pb-2 font-medium">Primary engineering proof</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {TRILOGY.map((row) => (
                <tr key={row.name} className={row.current ? "bg-[var(--ready-bg)]" : undefined}>
                  <td className="py-3 pr-4 font-medium text-ink">
                    {row.name}
                    {row.current && (
                      <span className="ml-2 rounded bg-ready/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ready">
                        This project
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{row.role}</td>
                  <td className="py-3 text-ink-muted">{row.proof}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="card-paper flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">
              See all five scenarios end to end
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              Including the one where an invoice tries to talk its way past
              the controls.
            </p>
          </div>
          <Link
            href="/demo"
            className="inline-flex shrink-0 items-center gap-2 rounded bg-ink px-5 py-2.5 text-sm font-medium text-paper-raised transition-opacity hover:opacity-90"
          >
            Open the AP workbench
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
