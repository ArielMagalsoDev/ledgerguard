import Link from "next/link";
import {
  ArrowRight,
  Fingerprint,
  ScanSearch,
  ShieldCheck,
  Split,
} from "lucide-react";
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

const TICKER_ITEMS = ["Ready for approval", "Exception review", "Duplicate hold", "Blocked", "Never a guess"];

// Real numbers from the latest verified eval run — see /evals for the
// current figure. Not live-queried on the homepage (same illustrative-but-
// truthful convention the rest of this page already uses); the actual
// current number is always one click away.
const STATS = [
  { value: "10/10", label: "Held-out cases passed, latest verified run" },
  { value: "0%", label: "Critical-control false-clearance rate" },
  { value: "50", label: "Real eval cases run through the live pipeline" },
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
    name: "Ledger Guard",
    role: "Finance operations",
    proof: "Document extraction, financial controls, matching, approvals, accounting integration",
    current: true,
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero — sits on the lighter paper panel with the header, same
          light/base two-tone grouping as agero.framer.website. */}
      <section className="bg-paper-light px-5 pb-16 pt-16 text-center sm:px-8 sm:pt-24">
        <div className="mx-auto max-w-6xl">
          <p className="section-marker">(AI invoice-exception automation)</p>
          <h1 className="mx-auto mt-5 max-w-4xl font-display text-5xl font-normal leading-[1.05] text-ink sm:text-6xl lg:text-7xl">
            Prepare invoices without <span className="text-accent">guessing</span> at financial data.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Ledger Guard extracts invoice data with visible evidence, recalculates every amount with deterministic
            code, matches suppliers and purchase orders, and routes exceptions to the right approver — never to a
            model&rsquo;s best guess. It never authorizes a payment on its own.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className="btn-pill btn-pill-primary">
              Run the guided AP workflow
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/evals" className="btn-pill btn-pill-outline">
              View control evaluations
            </Link>
          </div>
        </div>
      </section>

      {/* Marquee ticker */}
      <section className="overflow-hidden border-y border-rule bg-ink py-4">
        <div className="marquee-track">
          {[0, 1].map((rep) => (
            <div key={rep} className="flex shrink-0 items-center">
              {TICKER_ITEMS.map((item) => (
                <span key={item} className="mx-6 font-display text-xl text-dark-ink/90 sm:text-2xl">
                  {item} <span className="text-accent">·</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Proof points */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <p className="section-marker text-center">(Why Ledger Guard)</p>
        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {PROOF_POINTS.map((point) => (
            <div key={point.title}>
              <point.icon className="h-5 w-5 text-ready" aria-hidden />
              <h3 className="mt-3 font-display text-lg font-normal text-ink">{point.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{point.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Real-metrics stat block */}
      <section className="section-dark">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p className="section-marker">(Not illustrative — measured)</p>
          <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="font-display text-5xl font-normal text-dark-ink sm:text-6xl">{stat.value}</div>
                <p className="mt-2 text-sm text-ink-muted">{stat.label}</p>
              </div>
            ))}
          </div>
          <Link href="/evals" className="btn-pill btn-pill-outline mt-10">
            See the full eval report
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Four outcomes */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <p className="section-marker">(How every invoice resolves)</p>
        <h2 className="mt-2 font-display text-3xl font-normal text-ink sm:text-4xl">
          Every invoice ends in one of four states
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">
          There is no fifth state where the model decides on its own that something is probably fine. The public
          demo may simulate approval and accounting writes — it never presents &ldquo;paid&rdquo; as an outcome.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OUTCOME_ORDER.map((outcome, i) => {
            const meta = OUTCOME_META[outcome];
            return (
              <div key={outcome} className="card-paper p-6">
                <span className="font-tabular text-xs text-ink-faint">
                  0{i + 1} / 0{OUTCOME_ORDER.length}
                </span>
                <h3 className="mt-3 font-display text-lg font-normal" style={{ color: meta.color }}>
                  {meta.label}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{meta.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Impact calculator */}
      <section className="border-y border-rule bg-paper-raised/60">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p className="section-marker">(Illustrative)</p>
          <h2 className="mt-2 font-display text-3xl font-normal text-ink sm:text-4xl">Business impact</h2>
          <p className="mt-3 max-w-2xl text-sm text-ink-muted">
            For a fictional multi-property facilities operator processing thousands of invoices a month. Adjust
            the assumptions — the math updates live.
          </p>
          <div className="mt-8">
            <ImpactCalculator />
          </div>
        </div>
      </section>

      {/* Trilogy fit */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <p className="section-marker">(Portfolio)</p>
        <h2 className="mt-2 font-display text-3xl font-normal text-ink sm:text-4xl">Part of a three-project portfolio</h2>
        <p className="mt-3 max-w-2xl text-sm text-ink-muted">
          Knowledge work, sales operations, and document-heavy financial processes — each automated with human
          review, deterministic controls, evaluations, and integrations applied appropriately.
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
                      <span className="ml-2 rounded-full bg-ready/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ready">
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
            <h3 className="font-display text-2xl font-normal text-ink">See all five scenarios end to end</h3>
            <p className="mt-1 text-sm text-ink-muted">Including the one where an invoice tries to talk its way past the controls.</p>
          </div>
          <Link href="/demo" className="btn-pill btn-pill-primary shrink-0">
            Open the AP workbench
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
