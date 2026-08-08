import Link from "next/link";
import { ArrowRight, ExternalLink, Fingerprint, Mail, ScanSearch, ShieldCheck, Split } from "lucide-react";
import { ImpactCalculator } from "@/components/impact-calculator";
import { OUTCOME_META } from "@/lib/outcome";
import { AUTHOR, PORTFOLIO_PROJECTS } from "@/lib/portfolio";
import type { DecisionOutcome } from "@/lib/types";

const PROOF_POINTS = [
  {
    icon: ScanSearch,
    title: "Source-linked fields",
    body: "Every extracted value links to the document text that supports it. Unsupported values cannot silently pass as verified data.",
  },
  {
    icon: Split,
    title: "Three-way matching",
    body: "Invoice, purchase order, and receipt are compared line by line. Commercial mismatches become visible exceptions.",
  },
  {
    icon: Fingerprint,
    title: "Duplicate prevention",
    body: "Normalized supplier and invoice identity catches renamed rescans that file-hash comparison alone would miss.",
  },
  {
    icon: ShieldCheck,
    title: "Controlled approvals",
    body: "Deterministic code controls routing. Bank-detail changes always require out-of-band human verification.",
  },
];

const OUTCOME_ORDER: DecisionOutcome[] = [
  "ready_for_approval",
  "exception_review",
  "duplicate_hold",
  "blocked",
];

const STATS = [
  { value: "10/10", label: "Held-out cases passed", detail: "Latest verified evaluation run" },
  { value: "0%", label: "Critical false-clearance rate", detail: "Unsafe invoices cleared incorrectly" },
  { value: "50", label: "Labeled fictional cases", detail: "Processed by the live pipeline" },
  { value: "Solo", label: "End-to-end build", detail: "Product design through deployment" },
];

const PROJECT_SUMMARY = [
  ["Problem", "Manual invoice preparation is repetitive, slow, and financially sensitive."],
  ["Solution", "Evidence-linked AI extraction wrapped in deterministic controls and human approval."],
  ["My role", "Solo product design, full-stack engineering, evaluation design, operations, and deployment."],
  ["Stack", "Next.js, TypeScript, Claude, Supabase Postgres, Vercel, and a QuickBooks sandbox adapter."],
  ["Measured proof", "Held-out and development evaluations, audit history, latency, and model cost are visible."],
  ["Boundary", "Fictional data only. The public workflow never executes a payment or accounting write."],
];

export default function Home() {
  return (
    <div>
      <section id="overview" className="bg-paper-light px-5 pb-16 pt-16 text-center sm:px-8 sm:pb-20 sm:pt-24">
        <div className="mx-auto max-w-6xl">
          <p className="section-marker">(AI invoice-exception automation)</p>
          <h1 className="mx-auto mt-5 max-w-4xl font-display text-5xl font-normal leading-[1.05] text-ink sm:text-6xl lg:text-7xl">
            Prepare invoices without <span className="text-accent">guessing</span> at financial data.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
            A controlled accounts-payable workflow that combines evidence-linked AI extraction with deterministic
            financial checks and human approval. It prepares invoices for review; it never authorizes payment.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className="btn-pill btn-pill-primary">
              Run the guided workflow
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href={AUTHOR.repository} target="_blank" rel="noopener noreferrer" className="btn-pill btn-pill-outline">
              View source code ↗
            </a>
            <Link href="/case-study" className="btn-pill btn-pill-outline">Read the case study</Link>
          </div>
        </div>
      </section>

      <section aria-label="Measured project proof" className="section-dark border-y border-dark-rule">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid grid-cols-2 gap-px bg-dark-rule lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-dark-bg px-1 py-7 sm:px-6 sm:py-8">
                <p className="font-display text-3xl font-normal text-dark-ink sm:text-4xl">{stat.value}</p>
                <p className="mt-2 text-sm font-medium text-dark-ink">{stat.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ownership" className="border-b border-rule bg-paper-raised">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:py-20">
          <div>
            <p className="section-marker">(Project at a glance)</p>
            <h2 className="mt-3 font-display text-3xl font-normal text-ink sm:text-4xl">Built end to end by Ariel Magalso</h2>
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              I designed and implemented the workflow, data model, extraction schema, deterministic control engine,
              evaluation harness, approval interface, operational dashboard, and deployment.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={AUTHOR.portfolio} target="_blank" rel="noopener noreferrer" className="btn-pill btn-pill-primary">View portfolio ↗</a>
              <a href={`mailto:${AUTHOR.email}`} className="btn-pill btn-pill-outline">Contact Ariel</a>
            </div>
          </div>
          <dl className="grid overflow-hidden rounded-[var(--radius-card)] border border-rule sm:grid-cols-2">
            {PROJECT_SUMMARY.map(([term, description], index) => (
              <div
                key={term}
                className={`bg-paper-light p-5 ${index > 1 ? "border-t border-rule" : ""} ${index % 2 === 1 ? "sm:border-l sm:border-rule" : ""} ${index === 1 ? "border-t border-rule sm:border-t-0" : ""}`}
              >
                <dt className="font-tabular text-[11px] uppercase tracking-wide text-ink-faint">{term}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-ink">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="controls" className="section-dark">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="section-marker">(Technical judgment)</p>
            <h2 className="mt-3 font-display text-3xl font-normal text-dark-ink sm:text-4xl">The controls that make the AI useful</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              The model proposes document data. Deterministic code decides whether that data satisfies financial controls.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROOF_POINTS.map((point) => (
              <article key={point.title} className="rounded-[var(--radius-card)] border border-dark-rule bg-dark-surface p-6">
                <point.icon className="h-9 w-9 stroke-[1.6] text-accent" aria-hidden />
                <h3 className="mt-4 font-display text-lg font-normal text-dark-ink">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{point.body}</p>
              </article>
            ))}
          </div>
          <Link href="/architecture" className="btn-pill btn-pill-outline mt-8">Inspect the architecture <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </section>

      <section id="outcomes" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-marker">(Safe outcome model)</p>
            <h2 className="mt-3 font-display text-3xl font-normal text-ink sm:text-4xl">Every invoice ends in one of four states</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
              There is no fifth state where a model decides that something is probably fine.
            </p>
          </div>
          <Link href="/demo" className="btn-pill btn-pill-primary shrink-0">See all five scenarios <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OUTCOME_ORDER.map((outcome, index) => {
            const meta = OUTCOME_META[outcome];
            return (
              <article key={outcome} className="card-paper p-6">
                <span className="block font-tabular text-2xl font-medium tracking-tight text-ink-faint">
                  0{index + 1} / 0{OUTCOME_ORDER.length}
                </span>
                <h3 className="mt-4 font-display text-lg font-normal" style={{ color: meta.color }}>{meta.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{meta.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="impact" className="border-y border-rule bg-paper-raised/60">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-marker">(Illustrative business case)</p>
              <h2 className="mt-3 font-display text-3xl font-normal text-ink sm:text-4xl">What the workflow could return</h2>
              <p className="mt-3 max-w-2xl text-sm text-ink-muted">Fictional assumptions only. Adjust the inputs to explore the operating model.</p>
            </div>
            <span className="font-tabular text-xs text-ink-faint">Not a customer outcome</span>
          </div>
          <div className="mt-8"><ImpactCalculator /></div>
        </div>
      </section>

      <section id="portfolio" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <p className="section-marker">(Portfolio breadth)</p>
        <h2 className="mt-3 font-display text-3xl font-normal text-ink sm:text-4xl">Three workflows. Three different automation risks.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Support, revenue operations, and financial documents — each uses AI, deterministic controls, evaluation, and human review differently.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {PORTFOLIO_PROJECTS.map((project) => (
            <a
              key={project.name}
              href={project.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`card-paper group flex min-h-48 flex-col p-6 transition-transform hover:-translate-y-1 ${project.current ? "border-ready/40 bg-[var(--ready-bg)]" : ""}`}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-tabular text-[11px] uppercase tracking-wide text-ink-faint">{project.role}</span>
                <span className="text-2xl leading-none text-ink-faint transition-colors group-hover:text-accent">↗</span>
              </div>
              <h3 className="mt-8 font-display text-2xl font-normal text-ink">{project.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{project.proof}</p>
              {project.current && <span className="mt-auto pt-6 text-xs font-medium text-ready">Current project</span>}
            </a>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 lg:pb-20">
        <div className="card-paper flex flex-col gap-5 p-8 sm:flex-row sm:items-center sm:justify-between lg:p-10">
          <div>
            <p className="section-marker">(Live product evidence)</p>
            <h2 className="mt-2 font-display text-2xl font-normal text-ink sm:text-3xl">See every field, rule, and decision.</h2>
            <p className="mt-2 max-w-xl text-sm text-ink-muted">Run the clean path, price exception, duplicate, bank-detail change, and embedded-instruction scenario.</p>
          </div>
          <Link href="/demo" className="btn-pill btn-pill-primary shrink-0">Open the AP workbench <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-dark-rule bg-paper-light lg:grid lg:grid-cols-[1.25fr_0.75fr]">
          <div className="p-8 lg:p-12">
            <p className="inline-flex items-center gap-2 rounded-full border border-ready/25 bg-[var(--ready-bg)] px-3 py-1.5 text-xs font-medium text-ready">
              <span className="h-2 w-2 rounded-full bg-ready" aria-hidden />
              Open to AI automation opportunities
            </p>
            <h2 className="mt-6 max-w-2xl font-display text-3xl font-normal leading-tight text-ink sm:text-4xl">
              Let&apos;s build an automation people can trust.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
              I design measurable AI-assisted workflows with deterministic safeguards, clear evaluation, and human review where the risk demands it.
            </p>
          </div>
          <div className="flex flex-col justify-between gap-8 bg-accent p-8 text-white lg:p-10">
            <div>
              <p className="font-tabular text-[11px] uppercase tracking-[0.14em] text-white/70">Available for</p>
              <p className="mt-3 font-display text-2xl leading-tight">Workflow design, LLM evaluation, and production automation.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={`mailto:${AUTHOR.email}`} className="btn-pill bg-ink text-white hover:bg-black">
                <Mail className="h-4 w-4" aria-hidden /> Contact Ariel
              </a>
              <a href={AUTHOR.linkedin} target="_blank" rel="noopener noreferrer" className="btn-pill border border-white/50 text-white hover:bg-white hover:text-ink">
                <ExternalLink className="h-4 w-4" aria-hidden /> LinkedIn
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
