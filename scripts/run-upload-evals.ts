/**
 * Phase 4's upload-specific eval set (ledgerguard.md). Deliberately separate
 * from evals/run.ts: that harness proves the seeded/demo pipeline works;
 * this one proves the upload-mode POLICY VARIANT behaves as
 * ledgerguard.md's "Critical correction 2" and "Hard ceiling" sections
 * specify — supplier/PO/receipt-absent is an exception (not a block), and
 * ready_for_approval is structurally unreachable from source="upload" even
 * for an invoice that would otherwise cleanly match everything.
 *
 * Reuses real, already-vetted content from evals/cases.ts (each case's
 * documentLines are real fictional invoices checked against real seed
 * data) rather than authoring new fixtures — the only change per case is
 * giving it a fresh invoice number so it can't collide with a prior
 * eval_runs insertion or a real demo-scenario row, run through
 * processUpload (the actual upload code path — not submitInvoice/the
 * seeded-scenario path evals/run.ts exercises) under a synthetic session.
 *
 * Results go to eval_runs with a run_label prefixed "upload_sandbox_" so
 * /evals can render them in their own "upload sandbox validation results"
 * section — CLAUDE.md section 15's rule ("do not present a tuned
 * development-set score as production proof") extends here too: these
 * numbers are never blended into the seeded held-out metrics.
 *
 *   npm run run-upload-evals
 */
import { randomUUID } from "node:crypto";
import { EVAL_CASES } from "@/evals/cases";
import { generateInvoicePdf } from "@/lib/extraction/pdf-generate";
import { processUpload } from "@/lib/upload/process-upload";
import { purgeUploadInvoice } from "@/lib/upload/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { InvoiceDocumentLine } from "@/lib/types";

type UploadEvalResult = {
  id: string;
  title: string;
  pass: boolean;
  checks: Record<string, boolean>;
  outcome: string | null;
  reason: string | null;
  error?: string;
};

const results: UploadEvalResult[] = [];

function withUniqueInvoiceNumber(lines: InvoiceDocumentLine[], suffix: string): InvoiceDocumentLine[] {
  return lines.map((line) =>
    line.kind === "meta" && line.text.startsWith("Invoice #:")
      ? { ...line, text: `${line.text}-${suffix}` }
      : line
  );
}

async function runOne(
  id: string,
  title: string,
  documentLines: InvoiceDocumentLine[],
  assert: (outcome: string, reason: string) => Record<string, boolean>
): Promise<void> {
  const db = supabaseAdmin();
  let invoiceId: string | null = null;
  try {
    const pdfBytes = await generateInvoicePdf(documentLines);
    const sessionToken = randomUUID();
    const result = await processUpload(pdfBytes, `${id}.pdf`, sessionToken);
    if (!result.ok) {
      results.push({ id, title, pass: false, checks: {}, outcome: null, reason: null, error: JSON.stringify(result) });
      return;
    }
    invoiceId = result.invoiceId;
    const { data: decision } = await db.from("decisions").select("outcome, reason").eq("invoice_id", result.invoiceId).single();
    const outcome = decision?.outcome ?? "";
    const reason = decision?.reason ?? "";
    const checks = assert(outcome, reason);
    results.push({ id, title, pass: Object.values(checks).every(Boolean), checks, outcome, reason });
  } catch (err) {
    results.push({ id, title, pass: false, checks: {}, outcome: null, reason: null, error: err instanceof Error ? err.message : String(err) });
  } finally {
    if (invoiceId) {
      const { data: row } = await db.from("invoices").select("storage_path").eq("id", invoiceId).maybeSingle();
      await purgeUploadInvoice(db, invoiceId, row?.storage_path ?? null);
    }
  }
}

async function main() {
  console.log("=== Upload sandbox eval set ===\n");
  const stamp = Date.now().toString(36);
  const byCategory = new Map(EVAL_CASES.map((c) => [c.category, c] as const));

  // 1. Hard ceiling: a case that would naturally reach ready_for_approval
  // through the normal pipeline must NOT reach it through upload mode.
  const cleanCase = EVAL_CASES.find((c) => c.category === "clean_match" && c.expected.outcome === "ready_for_approval");
  if (cleanCase) {
    await runOne(
      "upload-hard-ceiling",
      "Hard ceiling — a naturally clean match never reaches ready_for_approval via upload",
      withUniqueInvoiceNumber(cleanCase.documentLines, `UP${stamp}`),
      (outcome, reason) => ({
        notReadyForApproval: outcome !== "ready_for_approval",
        isExceptionReview: outcome === "exception_review",
        reasonNamesTheCeiling: reason.includes("never auto-approves"),
      })
    );
  } else {
    console.log("  (skipped hard-ceiling case — no ready_for_approval clean_match case found in EVAL_CASES)");
  }

  // 2. Absent supplier/PO is an exception, never a block — ledgerguard.md's
  // "Critical correction 2" (the whole reason the upload-mode policy exists).
  await runOne(
    "upload-unknown-supplier",
    "Unknown supplier is exception_review, not blocked",
    withUniqueInvoiceNumber(
      [
        { id: "h1", kind: "header", text: "Driftwood Signage & Fabrication" },
        { id: "h2", kind: "meta", text: "Invoice #: DSF-9001" },
        { id: "h3", kind: "meta", text: "Invoice Date: 2026-08-01" },
        { id: "h4", kind: "meta", text: "Due Date: 2026-08-31" },
        { id: "h5", kind: "meta", text: "Tax ID: 11-2233445" },
        { id: "t1", kind: "table-header", text: "Description | Qty | Unit Price | Line Total" },
        { id: "l1", kind: "line-item", text: "Custom lobby signage | 1 | $620.00 | $620.00" },
        { id: "s1", kind: "totals", text: "Subtotal: $620.00" },
        { id: "s2", kind: "totals", text: "Sales Tax (8%): $49.60" },
        { id: "s3", kind: "totals", text: "Total: $669.60" },
      ],
      stamp
    ),
    (outcome) => ({
      isExceptionReview: outcome === "exception_review",
      notBlocked: outcome !== "blocked",
    })
  );

  // 3. Arithmetic failure still gets caught under upload mode (deterministic
  // controls run identically regardless of source).
  const arithCase = byCategory.get("arithmetic_tax_failure");
  if (arithCase) {
    await runOne(
      "upload-arithmetic-failure",
      "Arithmetic failure resolves to exception_review under upload mode",
      withUniqueInvoiceNumber(arithCase.documentLines, `UP${stamp}`),
      (outcome) => ({ isExceptionReview: outcome === "exception_review" })
    );
  }

  // 4. Embedded instructions: screened and visible, never change the outcome.
  const injectionCase = byCategory.get("adversarial_injection");
  if (injectionCase) {
    await runOne(
      "upload-injection-defense",
      "Instruction-shaped content is screened and never changes the upload-mode outcome",
      withUniqueInvoiceNumber(injectionCase.documentLines, `UP${stamp}`),
      (outcome) => ({
        notReadyForApproval: outcome !== "ready_for_approval",
        notablyNotAutoApproved: outcome === "exception_review" || outcome === "blocked",
      })
    );
  }

  // 5. Bank-detail change against a REAL seeded supplier still blocks —
  // upload mode never softens a genuine safety control, only the
  // "unknown supplier" case above (which upload traffic hits constantly
  // and isn't itself a safety signal).
  const bankCase = byCategory.get("supplier_bank_detail");
  if (bankCase) {
    await runOne(
      "upload-bank-detail-block",
      "Bank-detail mismatch against a known supplier still blocks under upload mode",
      withUniqueInvoiceNumber(bankCase.documentLines, `UP${stamp}`),
      (outcome) => ({ isBlocked: outcome === "blocked" })
    );
  }

  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} upload-eval case(s) passed.\n`);
  for (const r of results) {
    console.log(`  ${r.pass ? "✓" : "✗"} ${r.id} — ${r.title}${r.error ? ` (ERROR: ${r.error})` : ""}`);
    if (!r.pass && !r.error) console.log(`      checks: ${JSON.stringify(r.checks)}, outcome=${r.outcome}`);
  }

  const db = supabaseAdmin();
  const { error: insertError } = await db.from("eval_runs").insert({
    run_label: `upload_sandbox_${new Date().toISOString()}`,
    policy_version: "upload-mode",
    total_cases: results.length,
    passed_cases: results.filter((r) => r.pass).length,
    metrics: { note: "Upload sandbox validation results — not blended into the seeded eval's held-out numbers." },
    per_case: results,
  });
  if (insertError) {
    console.error(`\nFailed to write eval_runs row: ${insertError.message}`);
    process.exit(1);
  }

  process.exit(results.every((r) => r.pass) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
