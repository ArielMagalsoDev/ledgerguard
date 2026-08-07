/**
 * The real Phase 7 eval runner. Submits every case in evals/cases.ts through
 * the actual intake API and job processor (same pipeline run-demo-pipeline.ts
 * exercises), scores the result against each case's labeled ground truth,
 * and writes one row to eval_runs — which /evals reads to show real,
 * reproducible numbers instead of a "not yet measured" placeholder.
 *
 *   npm run run-evals
 */
import { EVAL_CASES, type EvalCase } from "@/evals/cases";
import { generateInvoicePdf } from "@/lib/extraction/pdf-generate";
import { submitInvoice } from "@/lib/workflow/submit-invoice";
import { processNextInvoiceJob } from "@/lib/workflow/process-invoice-job";
import { validateRequiredFields } from "@/lib/extraction/validate";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { DecisionOutcome, ExtractedInvoice } from "@/lib/types";

type CaseResult = {
  caseId: string;
  category: string;
  title: string;
  pass: boolean;
  checks: Record<string, boolean>;
  actual: {
    outcome: DecisionOutcome | null;
    invoiceNumber: string | null;
    total: string | null;
    supplierMatch: string | null;
    purchaseOrderMatch: string | null;
    requiresReview: boolean | null;
    injectionFlagged: boolean | null;
  };
  latencyMs: number;
  costUsd: number;
  error?: string;
};

async function runCase(caseDef: EvalCase): Promise<CaseResult> {
  const db = supabaseAdmin();
  const base: CaseResult = {
    caseId: caseDef.id,
    category: caseDef.category,
    title: caseDef.title,
    pass: false,
    checks: {},
    actual: { outcome: null, invoiceNumber: null, total: null, supplierMatch: null, purchaseOrderMatch: null, requiresReview: null, injectionFlagged: null },
    latencyMs: 0,
    costUsd: 0,
  };

  try {
    const pdfBytes = await generateInvoicePdf(caseDef.documentLines);
    const storagePath = `eval-cases/${caseDef.id}.pdf`;
    const { error: uploadError } = await db.storage.from("invoice-documents").upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`);

    const submissionId = `sub_eval_${caseDef.id}_${Date.now()}`;
    const submission = await submitInvoice({
      submissionId,
      source: "upload",
      originalFileName: `${caseDef.id}.pdf`,
      fileHash: `sha256:eval-${caseDef.id}`,
      mimeType: "application/pdf",
      receivedAt: new Date().toISOString(),
    });
    await db.from("invoices").update({ storage_path: storagePath }).eq("id", submission.invoiceId);

    let jobResult = await processNextInvoiceJob();
    let attempts = 0;
    while (jobResult.processed && "invoiceId" in jobResult && jobResult.invoiceId !== submission.invoiceId && attempts < 20) {
      jobResult = await processNextInvoiceJob();
      attempts++;
    }
    if (jobResult.processed && "error" in jobResult) {
      throw new Error(`job processor error: ${jobResult.error}`);
    }
    if (!jobResult.processed || !("invoiceId" in jobResult) || jobResult.invoiceId !== submission.invoiceId) {
      throw new Error("job processor never picked up this case's invoice");
    }

    const [{ data: invoice }, { data: decision }, { data: controls }, { data: auditRows }] = await Promise.all([
      db.from("invoices").select("*").eq("id", submission.invoiceId).single(),
      db.from("decisions").select("*").eq("invoice_id", submission.invoiceId).maybeSingle(),
      db.from("controls").select("*").eq("invoice_id", submission.invoiceId),
      db.from("audit_events").select("latency_ms, cost_usd").eq("invoice_id", submission.invoiceId),
    ]);
    if (!invoice) throw new Error("invoice row not found after processing");

    const extracted = invoice.extracted as unknown as ExtractedInvoice;
    const validation = validateRequiredFields(extracted);
    const screeningControl = (controls ?? []).find((c) => c.control_id === "source_screening");

    base.latencyMs = (auditRows ?? []).reduce((sum, e) => sum + (e.latency_ms ?? 0), 0);
    base.costUsd = (auditRows ?? []).reduce((sum, e) => sum + (e.cost_usd ?? 0), 0);
    base.actual = {
      outcome: (decision?.outcome as DecisionOutcome | undefined) ?? null,
      invoiceNumber: extracted.invoiceNumber?.value ?? null,
      total: extracted.total?.value ?? null,
      supplierMatch: null,
      purchaseOrderMatch: null,
      requiresReview: validation.requiresReview,
      injectionFlagged: screeningControl ? screeningControl.status === "warning" : null,
    };

    const { data: matchRow } = await db.from("match_results").select("supplier_match, purchase_order_match").eq("invoice_id", submission.invoiceId).maybeSingle();
    base.actual.supplierMatch = matchRow?.supplier_match ?? null;
    base.actual.purchaseOrderMatch = matchRow?.purchase_order_match ?? null;

    const checks: Record<string, boolean> = {};
    checks.outcome = base.actual.outcome === caseDef.expected.outcome;
    if (caseDef.expected.invoiceNumber !== undefined) checks.invoiceNumber = base.actual.invoiceNumber === caseDef.expected.invoiceNumber;
    if (caseDef.expected.total !== undefined) checks.total = base.actual.total === caseDef.expected.total;
    if (caseDef.expected.supplierMatch !== undefined) checks.supplierMatch = base.actual.supplierMatch === caseDef.expected.supplierMatch;
    if (caseDef.expected.purchaseOrderMatch !== undefined) checks.purchaseOrderMatch = base.actual.purchaseOrderMatch === caseDef.expected.purchaseOrderMatch;
    if (caseDef.expected.requiresReview !== undefined) checks.requiresReview = base.actual.requiresReview === caseDef.expected.requiresReview;
    if (caseDef.expected.injectionShouldBeFlagged !== undefined) checks.injectionFlagged = base.actual.injectionFlagged === caseDef.expected.injectionShouldBeFlagged;
    if (caseDef.expected.injectionShouldChangeOutcome !== undefined) {
      // The defense held iff the outcome matches what it would be WITHOUT the
      // injected text — i.e. the outcome check above already proves this,
      // this is just naming it explicitly for the injection-specific cases.
      checks.injectionDidNotChangeOutcome = checks.outcome;
    }

    base.checks = checks;
    base.pass = Object.values(checks).every(Boolean);
    return base;
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
    return base;
  }
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

async function main() {
  const db = supabaseAdmin();

  // FK-safe cleanup, same pattern as run-demo-pipeline.ts / test-accounting.ts.
  const { data: staleInvoices } = await db.from("invoices").select("id").like("submission_id", "sub_eval_%");
  const staleIds = (staleInvoices ?? []).map((r) => r.id);
  if (staleIds.length > 0) {
    await db.from("accounting_bills").delete().in("invoice_id", staleIds);
    await db.from("review_actions").delete().in("invoice_id", staleIds);
    await db.from("invoices").delete().in("id", staleIds);
  }
  console.log(`Cleaned up ${staleIds.length} prior sub_eval_* invoice(s).\n`);
  console.log(`Running ${EVAL_CASES.length} eval case(s)...\n`);

  const results: CaseResult[] = [];
  for (const caseDef of EVAL_CASES) {
    process.stdout.write(`  ${caseDef.id} (${caseDef.category})... `);
    const result = await runCase(caseDef);
    results.push(result);
    console.log(result.error ? `ERROR — ${result.error}` : result.pass ? "PASS" : `FAIL — ${JSON.stringify(result.checks)}`);
  }

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;

  const outcomeChecked = results.filter((r) => "outcome" in r.checks);
  const outcomeAccuracy = rate(outcomeChecked.filter((r) => r.checks.outcome).length, outcomeChecked.length);

  const headerChecked = results.filter((r) => "invoiceNumber" in r.checks);
  const headerFieldAccuracy = rate(headerChecked.filter((r) => r.checks.invoiceNumber).length, headerChecked.length);

  const monetaryChecked = results.filter((r) => "total" in r.checks);
  const monetaryFieldAccuracy = rate(monetaryChecked.filter((r) => r.checks.total).length, monetaryChecked.length);

  const supplierChecked = results.filter((r) => "supplierMatch" in r.checks);
  const supplierMatchAccuracy = rate(supplierChecked.filter((r) => r.checks.supplierMatch).length, supplierChecked.length);

  const poChecked = results.filter((r) => "purchaseOrderMatch" in r.checks);
  const poMatchAccuracy = rate(poChecked.filter((r) => r.checks.purchaseOrderMatch).length, poChecked.length);

  const readyExpected = results.filter((r) => EVAL_CASES.find((c) => c.id === r.caseId)?.expected.outcome === "ready_for_approval");
  const falseClearanceCandidates = results.filter((r) => EVAL_CASES.find((c) => c.id === r.caseId)?.expected.outcome !== "ready_for_approval");
  const falseClearanceRate = rate(
    falseClearanceCandidates.filter((r) => r.actual.outcome === "ready_for_approval").length,
    falseClearanceCandidates.length
  );
  const falseHoldRate = rate(readyExpected.filter((r) => r.actual.outcome !== "ready_for_approval").length, readyExpected.length);

  const injectionChecked = results.filter((r) => "injectionFlagged" in r.checks);
  const injectionDefenseHoldRate = rate(injectionChecked.filter((r) => r.checks.injectionDidNotChangeOutcome).length, injectionChecked.length);

  const metrics = {
    outcomeAccuracy,
    headerFieldAccuracy,
    monetaryFieldAccuracy,
    supplierMatchAccuracy,
    poMatchAccuracy,
    falseClearanceRate,
    falseHoldRate,
    injectionDefenseHoldRate,
    meanLatencyMs: mean(results.filter((r) => !r.error).map((r) => r.latencyMs)),
    meanCostUsd: mean(results.filter((r) => !r.error).map((r) => r.costUsd)),
    byCategory: Object.fromEntries(
      Array.from(new Set(results.map((r) => r.category))).map((cat) => {
        const inCat = results.filter((r) => r.category === cat);
        return [cat, { total: inCat.length, passed: inCat.filter((r) => r.pass).length }];
      })
    ),
  };

  const { data: policyRow } = await db.from("policies").select("version").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const { error: insertError } = await db.from("eval_runs").insert({
    run_label: `eval_${new Date().toISOString()}`,
    policy_version: policyRow?.version ?? "unknown",
    total_cases: total,
    passed_cases: passed,
    metrics,
    per_case: results,
  });
  if (insertError) {
    console.error(`\nFailed to write eval_runs row: ${insertError.message}`);
    process.exit(1);
  }

  console.log(`\n${passed}/${total} cases passed.`);
  console.log(`Metrics: ${JSON.stringify(metrics, null, 2)}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
