# Ledger Guard

AI-assisted invoice-exception automation for accounts payable — a portfolio
demo. Extracts invoice data with visible evidence, recalculates every amount
with deterministic code, matches suppliers and purchase orders, detects
duplicates and bank-detail changes, and routes exceptions to the right
approver. **It never authorizes a payment on its own.**

Third project in a three-part portfolio, alongside Meridian Assist (support
automation, RAG + citations) and SignalDesk (revenue operations, deterministic
lead scoring). Full product spec — business case, data interfaces, matching
and tolerance policy, security posture, roadmap — is in [`CLAUDE.md`](./CLAUDE.md).

## Status

The public application runs a real Claude extraction pipeline over fictional
invoice PDFs, persists workflow and audit data in Supabase Postgres, applies
deterministic matching and financial controls, and reports evaluation,
latency, and model-cost evidence. The QuickBooks sandbox adapter is implemented,
but public demo workflows deliberately stop before external accounting writes.

All 5 guided scenarios are implemented and verified end to end, including the
required embedded-instruction (prompt-injection) case:

1. Clean three-way match → ready for approval
2. Price and quantity exception → exception review
3. Probable duplicate (renamed rescan) → duplicate hold
4. Supplier bank-detail change → blocked
5. Embedded-instruction invoice → exception review (the injected "pre-approval"
   text is captured as untrusted data and changes nothing)

## Design

A "paper ledger" aesthetic — deliberately light-only, ivory paper, hairline
rules, tabular-numeral mono for every dollar figure. Distinct from both
sibling projects' visual identities. See `app/globals.css`.

## Stack

Next.js 16 (App Router, TypeScript strict, Tailwind v4), Anthropic Claude,
Supabase Postgres and Storage, Vercel, and a QuickBooks Online sandbox adapter.

## Authorship

Independently designed and built by [Ariel Magalso](https://arielmagalso.com),
an AI Automation Specialist based in the Philippines. Architecture, application
development, evaluation design, database work, operational monitoring,
interface, and deployment are all part of this solo portfolio build.

[LinkedIn](https://www.linkedin.com/in/magalsoariel) · [GitHub](https://github.com/ArielMagalsoDev) · [Email](mailto:hello@arielmagalso.com)

## Run locally

```bash
npm install
npm run dev
```

## Pages

- `/` — business case, four outcomes, illustrative ROI calculator
- `/demo` — the AP workbench, all 5 guided scenarios
- `/queue` — AP review queue (seeded from the 5 demo invoices)
- `/evals` — evaluation scorecard and dataset plan
- `/architecture` — pipeline, AI-vs-deterministic split, security, stack
- `/operations` — aggregated audit events, latency, and cost
- `/case-study` — recruiter-oriented project decisions, ownership, proof, and limitations

## Non-negotiables (see `CLAUDE.md` for the full list)

- No workflow — in this demo or in its design — can execute a payment.
- Every extracted value must trace to visible document evidence.
- Financial arithmetic is always recalculated by code, never trusted from the
  printed figure.
- A bank-detail change always creates a mandatory hold, regardless of amount.
- Instructions embedded in invoice text are treated as untrusted data and
  never change a decision, a status, or supplier data.
