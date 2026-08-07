import type { Metadata } from "next";
import { Bot, Cpu, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Architecture — LedgerGuard",
  description: "System, security, and integration design for LedgerGuard.",
};

type Actor = "ai" | "deterministic" | "human";

const ACTOR_META: Record<Actor, { label: string; icon: typeof Bot; color: string }> = {
  ai: { label: "AI model", icon: Bot, color: "var(--exception)" },
  deterministic: { label: "Deterministic code", icon: Cpu, color: "var(--ready)" },
  human: { label: "Human", icon: Users, color: "var(--duplicate)" },
};

const PIPELINE: { title: string; detail: string; actor: Actor }[] = [
  { title: "Intake & file validation", detail: "Type, size, and magic-byte checks. No active content ever reaches a browser context.", actor: "deterministic" },
  { title: "OCR & structured extraction", detail: "Document rendered and read; header fields and line items extracted into a strict schema (tool-forced JSON).", actor: "ai" },
  { title: "Evidence alignment", detail: "Every extracted value is aligned against the OCR/text-layer token positions. A value that can't be found in the document drops to 'uncertain' — the model never emits its own bounding boxes.", actor: "deterministic" },
  { title: "Instruction screening", detail: "Notes and free-text fields are scanned for instruction-shaped content before anything downstream reads them.", actor: "deterministic" },
  { title: "Arithmetic validation", detail: "Line totals, subtotal, tax, and grand total are recomputed from scratch using decimal-safe code — never trusted from the printed figure.", actor: "deterministic" },
  { title: "Supplier identity match", detail: "Tax ID first, name as a supporting signal only. Multiple credible matches or a new supplier never auto-resolve.", actor: "deterministic" },
  { title: "Duplicate detection", detail: "File hash, normalized identity (supplier + invoice number + date + amount), and line-item fingerprint — runs before any approval routing.", actor: "deterministic" },
  { title: "PO & receipt matching", detail: "Supplier, currency, status, and remaining balance compared; SKU takes precedence over description similarity.", actor: "deterministic" },
  { title: "Tolerance & exception rules", detail: "Configured, versioned tolerances decide pass/fail — not a confidence score.", actor: "deterministic" },
  { title: "Exception summary drafting", detail: "Plain-language explanation generated only from already-verified control results — the model never sees or drafts from unscreened invoice text.", actor: "ai" },
  { title: "Decision & routing", detail: "Ready / Exception / Duplicate Hold / Blocked, with an approval route and required actions.", actor: "deterministic" },
  { title: "Accounting draft", detail: "Idempotent draft-bill creation only. No workflow can execute a payment.", actor: "deterministic" },
  { title: "Human review", detail: "AP and approvers act on exceptions, holds, and blocks — every decision recorded to the audit trail.", actor: "human" },
];

const CONTROLS_VS_AI = {
  ai: [
    "Locating candidate fields across varied invoice layouts",
    "Extracting header data and line items to a strict schema",
    "Classifying invoice type",
    "Mapping free-text descriptions to likely PO lines",
    "Drafting an exception summary from verified control results",
    "Explaining discrepancies in plain language",
  ],
  deterministic: [
    "Decimal arithmetic and total recalculation",
    "Supplier-master comparison, tax-ID and domain normalization",
    "Exact and fuzzy duplicate rules",
    "Quantity and unit-price tolerances, PO balance checks",
    "Approval thresholds and accounting-period rules",
    "Idempotency, permissions, retry limits",
    "Instruction-shaped-content screening",
  ],
};

const TOLERANCES = [
  { rule: "Unit price", value: "Lower of 2% or $25 per line" },
  { rule: "Quantity", value: "Zero, unless a receipt records the additional quantity" },
  { rule: "Total invoice", value: "Lower of 1% or $50" },
  { rule: "Tax", value: "$0.02 rounding only" },
  { rule: "Invoice date", value: "Cannot precede the PO date" },
  { rule: "Due date", value: "Cannot precede the invoice date" },
];

const SECURITY_NOTES = [
  "Invoice text and QR codes are treated as untrusted data — embedded instructions directed at the model or operator are ignored, never executed.",
  "File type, size, and magic bytes are validated at intake. A real AV engine is not practical on serverless infrastructure — this is documented as a production deployment requirement, not simulated.",
  "All tables are RLS-locked to service-role access only, from the first migration.",
  "Remittance/bank details from an invoice never overwrite the supplier master, ever.",
  "Bank and tax identifiers are masked in ordinary logs; full document text is kept out of model-provider logs.",
  "Invoice submitters cannot approve their own invoices.",
  "No real supplier or financial data appears anywhere in the public portfolio.",
];

const STACK = [
  { label: "App", value: "Next.js 16 (App Router, TypeScript strict, Tailwind v4) on Vercel" },
  { label: "Data", value: "Supabase Postgres — NUMERIC money, audit events, jobs; Storage for documents with signed URLs" },
  { label: "Extraction", value: "Anthropic Claude, native PDF/vision input, tool-forced JSON schema output" },
  { label: "Accounting integration", value: "QuickBooks Online sandbox (or equivalent) — draft bills only, idempotent, external IDs recorded" },
];

export default function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl font-semibold text-ink">Architecture</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Every stage below is either deterministic code, an AI model call, or a
        human decision — and the pipeline never lets an AI call stand in for a
        financial control.
      </p>

      {/* Pipeline */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold text-ink">Pipeline</h2>
        <ol className="mt-5 space-y-0 border-l border-rule pl-5">
          {PIPELINE.map((stage, i) => {
            const meta = ACTOR_META[stage.actor];
            const Icon = meta.icon;
            return (
              <li key={stage.title} className="relative py-3.5">
                <span className="absolute -left-[25px] top-4.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-paper bg-paper-raised text-[8px] font-bold text-ink-faint">
                  {i + 1}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-ink">{stage.title}</h3>
                  <span
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
                  >
                    <Icon className="h-2.5 w-2.5" aria-hidden />
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-ink-muted">{stage.detail}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* AI vs deterministic */}
      <section className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">What AI does</h2>
          <ul className="mt-4 space-y-2">
            {CONTROLS_VS_AI.ai.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-ink-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-exception" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">What deterministic code decides</h2>
          <ul className="mt-4 space-y-2">
            {CONTROLS_VS_AI.deterministic.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-ink-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ready" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <p className="mt-4 max-w-2xl text-sm text-ink-muted">
        The model proposes extracted values. Deterministic code decides whether
        they satisfy financial controls — never the other way around.
      </p>

      {/* Tolerances */}
      <section className="mt-14">
        <h2 className="font-display text-xl font-semibold text-ink">Tolerance policy</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Fictional v1 values — all versioned as configuration (current: <code className="font-tabular text-xs">policy_2026.3</code>).
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <tbody className="divide-y divide-rule">
              {TOLERANCES.map((t) => (
                <tr key={t.rule}>
                  <td className="py-2.5 pr-6 font-medium text-ink">{t.rule}</td>
                  <td className="py-2.5 font-tabular text-ink-muted">{t.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Security */}
      <section className="mt-14">
        <h2 className="font-display text-xl font-semibold text-ink">Security & privacy</h2>
        <ul className="mt-4 space-y-2.5">
          {SECURITY_NOTES.map((note) => (
            <li key={note} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-blocked" />
              {note}
            </li>
          ))}
        </ul>
      </section>

      {/* Stack */}
      <section className="mt-14 mb-8">
        <h2 className="font-display text-xl font-semibold text-ink">Stack & integrations</h2>
        <dl className="mt-4 space-y-3">
          {STACK.map((row) => (
            <div key={row.label} className="grid grid-cols-1 gap-1 sm:grid-cols-[160px_1fr] sm:gap-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {row.label}
              </dt>
              <dd className="text-sm text-ink-muted">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
