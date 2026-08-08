import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Code2, Mail } from "lucide-react";
import { AUTHOR } from "@/lib/portfolio";
import { RecruiterProof } from "@/components/recruiter-proof";

export const metadata: Metadata = {
  title: "Case study — Ledger Guard",
  description: "How Ariel Magalso designed and built a controlled AI invoice-exception workflow.",
};

const SECTIONS = [
  {
    title: "The problem",
    body: "Accounts-payable teams repeatedly copy invoice data, verify arithmetic, search for purchase orders and receipts, check for duplicates, and decide who must review an exception. The work is repetitive, but a wrong answer can create a real financial loss.",
  },
  {
    title: "The design decision",
    body: "AI is used where documents are variable: locating and extracting candidate fields and drafting explanations. Code handles money, identity, duplicate rules, tolerances, routing, permissions, and idempotency. A model never decides that an invoice is financially safe.",
  },
  {
    title: "What I built",
    body: "I independently designed and implemented the Next.js application, Claude extraction pipeline, evidence alignment, Supabase data model, matching and control engine, five-scenario workbench, approval queue, evaluation harness, operations dashboard, QuickBooks sandbox adapter, and deployment.",
  },
  {
    title: "How risk is controlled",
    body: "Every extracted field must point to document evidence. Monetary values are recalculated with decimal-safe code. Bank-detail changes are blocked, duplicate identity survives renamed files, embedded instructions remain untrusted document text, and every proposed external write carries an idempotency key.",
  },
  {
    title: "How it is evaluated",
    body: "The evaluation runner sends labeled fictional invoices through the actual extraction, alignment, matching, and decision pipeline. Held-out and development splits are reported separately, failures remain visible, and critical false clearances are measured independently from field-level extraction errors.",
  },
  {
    title: "Current limitations",
    body: "This is a portfolio demonstration, not a customer deployment. All entities and financial data are fictional. The public workflow intentionally stops before executing an accounting write or payment, and the evaluation set is still small compared with a production document population.",
  },
];

export default function CaseStudyPage() {
  return (
    <div>
      <section className="bg-paper-light px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <p className="section-marker">(Recruiter case study · 5 minute read)</p>
          <h1 className="mt-4 font-display text-5xl font-normal leading-tight text-ink sm:text-6xl">
            Building AI automation that <span className="text-accent">never moves money on a guess.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">
            Ledger Guard is a solo full-stack portfolio project by {AUTHOR.name}, created to demonstrate controlled,
            measurable AI automation for a financially sensitive workflow.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={AUTHOR.repository} target="_blank" rel="noopener noreferrer" className="btn-pill btn-pill-primary">
              <Code2 className="h-4 w-4" aria-hidden /> View source
            </a>
            <a href={`mailto:${AUTHOR.email}`} className="btn-pill btn-pill-outline">
              <Mail className="h-4 w-4" aria-hidden /> Contact Ariel
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-rule bg-rule sm:grid-cols-3">
          {[
            ["Role", "Solo AI automation design and engineering"],
            ["Stack", "Next.js · Claude · Supabase · Vercel"],
            ["Proof", "Live pipeline · evals · audit history"],
          ].map(([term, value]) => (
            <div key={term} className="bg-paper-raised p-5">
              <dt className="font-tabular text-[11px] uppercase tracking-wide text-ink-faint">{term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-14 space-y-12">
          {SECTIONS.map((section, index) => (
            <article key={section.title} className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:gap-8">
              <p className="font-tabular text-xs text-ink-faint">0{index + 1} / 0{SECTIONS.length}</p>
              <div>
                <h2 className="font-display text-2xl font-normal text-ink">{section.title}</h2>
                <p className="mt-3 leading-relaxed text-ink-muted">{section.body}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="card-paper mt-16 flex flex-col gap-5 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-normal text-ink">Inspect the system, not just the summary.</h2>
            <p className="mt-2 text-sm text-ink-muted">Run five controlled scenarios and inspect every field, rule, and decision.</p>
          </div>
          <Link href="/demo" className="btn-pill btn-pill-primary shrink-0">Open the workbench <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </section>
      <RecruiterProof
        title="The case study connects design decisions to working evidence."
        description="Continue into the live workbench, inspect the source and evaluations, or contact Ariel about AI automation and workflow-engineering opportunities."
      />
    </div>
  );
}
