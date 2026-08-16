# LedgerGuard

AI-assisted invoice-exception automation for accounts payable.

One Python application: FastAPI serves the UI and the API, PostgreSQL is the durable workflow
store, and Claude performs the one genuinely hard language task — reading an invoice PDF and
turning it into structured data with evidence.

**Stack:** Python · FastAPI · Jinja2 · SQLAlchemy · PostgreSQL · Docker Compose · Claude API

## The problem

Accounts payable is where a confident wrong answer costs money directly. An invoice arrives as a
PDF, and someone has to decide whether it matches a purchase order, whether the arithmetic is
right, whether it has already been paid under a slightly different file name, and whether the bank
details on it are the supplier's real ones.

Hand that to an LLM naively and it will read a total off the page and believe it, approve a
duplicate because the filename changed, quietly accept new bank details on a supplier record, and
follow an instruction printed inside the invoice itself. Invoice fraud works precisely because the
document *looks* routine — and a system that only pattern-matches "does this look like an invoice"
is the easiest thing in the process to fool.

## The solution

Claude reads the document; deterministic code decides everything that follows.

- **It never authorizes a payment.** Not in this demo and not in the design. The pipeline's
  terminal state is always a recommendation to a named approver.
- **Arithmetic is recalculated, never trusted.** Line totals, tax, and invoice totals are
  recomputed in integer cents from the extracted line items. The printed total is evidence, not an
  answer.
- **Every extracted value traces to the document.** Evidence coordinates come from deterministically
  aligning each value against the PDF's real text layer — the model never emits its own bounding
  box, and a value that can't be found verbatim in the document drops to `uncertain` and can't pass
  a required-field control.
- **Duplicate detection survives a rename.** Matching is on supplier identity and normalized
  invoice content, not on file names.
- **Bank-detail changes always block.** Any change to supplier banking creates a mandatory hold
  regardless of amount — there is no tolerance threshold that lets one through.
- **Embedded instructions are data, not commands.** Text inside an invoice telling the system it is
  "pre-approved" is captured, flagged, and changes nothing — no decision, status, or supplier
  record.
- **Measured, not asserted.** A labeled eval suite grades outcome, field, and duplicate/injection
  accuracy on a held-out split, and publishes the scorecard at `/evals`.

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:8000`. The web app, the durable worker, and a daily cleanup cron run as
separate containers from the same package. Leave `ANTHROPIC_API_KEY` empty and the whole demo —
every guided scenario and the eval suite — runs on a deterministic fallback extractor (regex
reads off the PDF's real text layer, not a lookup table) that reproduces the same labeled outcomes
as the real model calls, at $0. Set a real key to exercise Claude's native PDF extraction instead.

## Guided demo

Visit `/demo` and inspect five scenarios, each engineered to land on a different responsible
outcome:

| Scenario | Outcome |
|---|---|
| Clean three-way match (Brightway Janitorial Supply) | `ready_for_approval` — supplier, PO, and receipt all agree |
| Price and quantity exception (Summit Peak HVAC) | `exception_review` — arithmetically correct, commercially over tolerance |
| Probable duplicate (Anchor Point Pest Control) | `duplicate_hold` — same identity, renamed file |
| Supplier bank-detail change (Coastal Sentinel Security) | `blocked` — remittance details don't match the verified supplier master |
| Embedded-instruction invoice (Palisade Grounds & Landscaping) | `exception_review` — a fake "CFO pre-approval" notice is flagged and changes nothing |

`python -m ledgerguard.run_demo_pipeline` (already run once by the containers on first boot) seeds
these five as real processed invoices, so `/demo`, `/queue`, and `/operations` show live pipeline
output rather than static fixtures.

## API behavior

- `POST /api/invoices` is idempotent on `submissionId` — a replay returns the existing workflow
  result and never creates a second job.
- The worker claims queued jobs with `FOR UPDATE SKIP LOCKED`; failed jobs retry before
  `failed_permanent`, refunding reserved spend.
- The one Claude call (native PDF extraction, forced tool schema) has a deterministic fallback,
  used whenever `ANTHROPIC_API_KEY` is unset.
- A per-IP hourly rate limit and a race-safe daily spend cap guard the upload sandbox — both
  env-gated and never block the guided demo.
- `POST /api/invoices/{id}/actions` (approve/reject/reassign/comment) re-checks the approval route
  and role server-side — a disabled button in the UI is not the actual enforcement boundary.
- `PATCH /api/invoices/{id}/fields` records a human correction and re-runs arithmetic and the full
  decision engine, so a correction can actually change the outcome.

## Upload sandbox

Off by default (`UPLOAD_SANDBOX_ENABLED=false`). When enabled, `/try` lets a visitor upload one
invoice-like PDF through the same real pipeline, under a stricter policy: an unrecognized supplier
becomes a non-blocking exception instead of an instant block, and the outcome can never reach
`ready_for_approval` — enforced in the decision engine itself, not left to the checks happening to
fail. Uploads are validated (magic bytes, active-content scan, encryption check, page count, text
layer density), deleted automatically within 30 minutes or instantly on request, and rate-limited
per connection.

## Evaluation suite

```bash
python -m ledgerguard.evals
```

Runs a labeled set (5 scenario-derived cases + 3 hand-authored + 50 generated from real seed data,
across 7 categories) through the actual intake and job processor, grades outcome/field/duplicate/
injection accuracy on a dev-vs-held-out split, and writes a scorecard to the database for `/evals`
to render. Works identically with or without an API key; the page labels which mode produced the
last run.

## Development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest
ruff check .
uvicorn ledgerguard.main:app --reload
ledgerguard-worker
```

Postgres is required for the worker's `SKIP LOCKED` claim query to mean anything under real
concurrency, but the whole app also runs against SQLite for fast local iteration
(`DATABASE_URL=sqlite:///./dev.db`). There is no migrations directory; the schema is created with
`Base.metadata.create_all()` on startup, so schema changes are a "drop the volume and restart"
operation.

The design system (`styles/input.css`, Tailwind v4) is compiled once and the output is checked
into `ledgerguard/static/css/globals.css` — the running app has no Node dependency at all. After
changing a template's classes or `styles/input.css`, regenerate it:

```bash
cd styles && npm install && npm run build
```

## Deployments

Intended to run on a VPS: web, the durable worker, Postgres, and a cleanup cron in Docker Compose
behind a reverse proxy with TLS.

Redeploy with `./deploy-vps.sh` (rsync + `docker compose up -d --build`), pointing it at your own
host:

```bash
LEDGERGUARD_VPS_HOST=user@your-host LEDGERGUARD_VPS_KEY=~/.ssh/id_ed25519 ./deploy-vps.sh
```

The server's `.env` and its reverse-proxy routing labels in `docker-compose.override.yml` are left
untouched, so secrets live only on the box and are never committed to this repo.

## Project layout

```
ledgerguard/
  main.py                 FastAPI app: HTML pages + JSON API
  worker.py                Durable job-queue worker
  models.py                 SQLAlchemy schema
  extraction/              PDF generation/reading, evidence alignment, arithmetic, the one Claude call + its fallback
  matching/                Supplier identity, bank-detail, duplicate, PO/receipt matching, the decision orchestrator
  workflow/                Idempotent intake + the per-stage pipeline runner
  upload/                  The bring-your-own-invoice sandbox
  fixtures/                The 5 guided scenarios + shared portfolio content
  evals/                   The labeled eval set + grading harness
  templates/, static/      Jinja2 templates + the compiled Tailwind design system
tests/                     Unit tests, pipeline end-to-end, HTTP API tests
styles/                    Build-time-only Tailwind CLI config (not a runtime dependency)
```

All suppliers, invoices, purchase orders, and dollar figures in the guided demo are fictional.
