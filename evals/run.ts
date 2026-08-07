/**
 * The real Phase 7 eval runner. Submits every case in evals/cases.ts through
 * the actual intake API and job processor (same pipeline run-demo-pipeline.ts
 * exercises), scores the result against each case's labeled ground truth,
 * and writes one row to eval_runs — which /evals reads to show real,
 * reproducible numbers instead of a "not yet measured" placeholder.
 *
 * Metrics are computed separately for the "dev" and "held_out" splits
 * (evals/cases.ts's assignSplits) — CLAUDE.md section 15: "Do not present a
 * tuned development-set score as production proof." held_out is the number
 * that's allowed to be quoted as production proof; dev is for tuning.
 *
 *   npm run run-evals
 */
import { EVAL_CASES, type EvalCase, type EvalSplit } from "@/evals/cases";
import { generateInvoicePdf } from "@/lib/extraction/pdf-generate";
import { submitInvoice } from "@/lib/workflow/submit-invoice";
import { processNextInvoiceJob } from "@/lib/workflow/process-invoice-job";
import { validateRequiredFields } from "@/lib/extraction/validate";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { DecisionOutcome, ExtractedField, ExtractedInvoice } from "@/lib/types";

type FieldTally = { verifiedCount: number; verifiedWithValidEvidence: number; nonNullCount: number; unsupportedCount: number };

type CaseResult = {
  caseId: string;
  category: string;
  title: string;
  split: EvalSplit;
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
    hasDuplicateCandidates: boolean | null;
  };
  fieldTally: FieldTally;
  lineItemFieldTotal: number;
  lineItemFieldCorrect: number;
  latencyMs: number;
  costUsd: number;
  error?: string;
};

// Every ExtractedField in a document — header fields plus every line item's
// sub-fields — same enumeration process-invoice-job.ts's countVerified()
// uses, reused here so "verified"/evidence-validity accounting matches what
// the pipeline itself considers a field.
function allFields(extracted: ExtractedInvoice): Array<ExtractedField<string>> {
  const header = [
    extracted.invoiceNumber,
    extracted.invoiceDate,
    extracted.dueDate,
    extracted.supplierName,
    extracted.supplierTaxId,
    extracted.purchaseOrderNumber,
    extracted.currency,
    extracted.subtotal,
    extracted.tax,
    extracted.total,
    extracted.remittanceDetails,
    extracted.notes,
  ].filter((f): f is NonNullable<typeof f> => f != null);
  const lineFields = (extracted.lineItems ?? []).flatMap((li) =>
    [li.description, li.quantity, li.unitPrice, li.taxRate, li.lineTotal].filter((f): f is NonNullable<typeof f> => f != null)
  );
  return [...header, ...lineFields];
}

function isValidBoundingBox(box: unknown): boolean {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  const [x0, y0, x1, y1] = box as number[];
  return x0 >= 0 && y0 >= 0 && x1 <= 1 && y1 <= 1 && x0 <= x1 && y0 <= y1;
}

function tallyFields(extracted: ExtractedInvoice): FieldTally {
  const tally: FieldTally = { verifiedCount: 0, verifiedWithValidEvidence: 0, nonNullCount: 0, unsupportedCount: 0 };
  for (const field of allFields(extracted)) {
    if (field.value != null) {
      tally.nonNullCount++;
      if (field.status !== "verified") tally.unsupportedCount++;
    }
    if (field.status === "verified") {
      tally.verifiedCount++;
      const hasValidEvidence = field.evidence.length > 0 && field.evidence.every((e) => isValidBoundingBox(e.boundingBox));
      if (hasValidEvidence) tally.verifiedWithValidEvidence++;
    }
  }
  return tally;
}

async function runCase(caseDef: EvalCase): Promise<CaseResult> {
  const db = supabaseAdmin();
  const base: CaseResult = {
    caseId: caseDef.id,
    category: caseDef.category,
    title: caseDef.title,
    split: caseDef.split ?? "dev",
    pass: false,
    checks: {},
    actual: {
      outcome: null,
      invoiceNumber: null,
      total: null,
      supplierMatch: null,
      purchaseOrderMatch: null,
      requiresReview: null,
      injectionFlagged: null,
      hasDuplicateCandidates: null,
    },
    fieldTally: { verifiedCount: 0, verifiedWithValidEvidence: 0, nonNullCount: 0, unsupportedCount: 0 },
    lineItemFieldTotal: 0,
    lineItemFieldCorrect: 0,
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

    base.fieldTally = tallyFields(extracted);
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
      hasDuplicateCandidates: null,
    };

    const { data: matchRow } = await db
      .from("match_results")
      .select("supplier_match, purchase_order_match, duplicate_candidates")
      .eq("invoice_id", submission.invoiceId)
      .maybeSingle();
    base.actual.supplierMatch = matchRow?.supplier_match ?? null;
    base.actual.purchaseOrderMatch = matchRow?.purchase_order_match ?? null;
    base.actual.hasDuplicateCandidates = matchRow ? ((matchRow.duplicate_candidates as unknown[] | null)?.length ?? 0) > 0 : null;

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
    if (caseDef.expected.expectDuplicateCandidates !== undefined) {
      checks.duplicateCandidates = base.actual.hasDuplicateCandidates === caseDef.expected.expectDuplicateCandidates;
    }

    if (caseDef.expected.lineItems) {
      const actualLines = extracted.lineItems ?? [];
      let total = 0;
      let correct = 0;
      caseDef.expected.lineItems.forEach((expectedLine, idx) => {
        const actualLine = actualLines[idx];
        (["description", "quantity", "unitPrice", "lineTotal"] as const).forEach((field) => {
          total++;
          if (actualLine && actualLine[field]?.value === expectedLine[field]) correct++;
        });
      });
      base.lineItemFieldTotal = total;
      base.lineItemFieldCorrect = correct;
      checks.lineItems = total > 0 && correct === total;
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

/** Computes the full metrics object over an arbitrary slice of results — called once for "held_out", once for "dev", once for "overall" (blended, reference only — never the number quoted as production proof). */
function computeMetrics(results: CaseResult[], allCasesById: Map<string, EvalCase>) {
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

  const readyExpected = results.filter((r) => allCasesById.get(r.caseId)?.expected.outcome === "ready_for_approval");
  const falseClearanceCandidates = results.filter((r) => allCasesById.get(r.caseId)?.expected.outcome !== "ready_for_approval");
  const falseClearanceRate = rate(
    falseClearanceCandidates.filter((r) => r.actual.outcome === "ready_for_approval").length,
    falseClearanceCandidates.length
  );
  const falseHoldRate = rate(readyExpected.filter((r) => r.actual.outcome !== "ready_for_approval").length, readyExpected.length);

  const injectionChecked = results.filter((r) => "injectionFlagged" in r.checks);
  const injectionDefenseHoldRate = rate(injectionChecked.filter((r) => r.checks.injectionDidNotChangeOutcome).length, injectionChecked.length);

  // Line-item extraction accuracy: field-level, across every case that carries lineItems ground truth.
  const lineItemCases = results.filter((r) => r.lineItemFieldTotal > 0);
  const lineItemFieldAccuracy = rate(
    lineItemCases.reduce((sum, r) => sum + r.lineItemFieldCorrect, 0),
    lineItemCases.reduce((sum, r) => sum + r.lineItemFieldTotal, 0)
  );

  // Evidence-coordinate validity: of every field the pipeline itself called
  // "verified", what fraction actually carries a structurally valid
  // bounding box? (Not a ground-truth comparison — a structural sanity
  // check on whatever the model claimed to have verified.)
  const evidenceCoordinateValidity = rate(
    results.reduce((sum, r) => sum + r.fieldTally.verifiedWithValidEvidence, 0),
    results.reduce((sum, r) => sum + r.fieldTally.verifiedCount, 0)
  );

  // Unsupported-field rate: of every field that got a non-null value, what
  // fraction couldn't be independently verified against the document?
  const unsupportedFieldRate = rate(
    results.reduce((sum, r) => sum + r.fieldTally.unsupportedCount, 0),
    results.reduce((sum, r) => sum + r.fieldTally.nonNullCount, 0)
  );

  // Duplicate precision/recall: signal-level, from match_results.duplicate_candidates directly (not just the outcome).
  const dupChecked = results.filter((r) => allCasesById.get(r.caseId)?.expected.expectDuplicateCandidates !== undefined);
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const r of dupChecked) {
    const expected = allCasesById.get(r.caseId)?.expected.expectDuplicateCandidates;
    const actual = r.actual.hasDuplicateCandidates;
    if (expected && actual) tp++;
    else if (!expected && actual) fp++;
    else if (expected && !actual) fn++;
  }
  const duplicatePrecision = rate(tp, tp + fp);
  const duplicateRecall = rate(tp, tp + fn);

  return {
    outcomeAccuracy,
    headerFieldAccuracy,
    monetaryFieldAccuracy,
    supplierMatchAccuracy,
    poMatchAccuracy,
    lineItemFieldAccuracy,
    evidenceCoordinateValidity,
    unsupportedFieldRate,
    duplicatePrecision,
    duplicateRecall,
    falseClearanceRate,
    falseHoldRate,
    injectionDefenseHoldRate,
    meanLatencyMs: mean(results.filter((r) => !r.error).map((r) => r.latencyMs)),
    meanCostUsd: mean(results.filter((r) => !r.error).map((r) => r.costUsd)),
    caseCount: results.length,
    byCategory: Object.fromEntries(
      Array.from(new Set(results.map((r) => r.category))).map((cat) => {
        const inCat = results.filter((r) => r.category === cat);
        return [cat, { total: inCat.length, passed: inCat.filter((r) => r.pass).length }];
      })
    ),
  };
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

  const allCasesById = new Map(EVAL_CASES.map((c) => [c.id, c]));
  const results: CaseResult[] = [];
  for (const caseDef of EVAL_CASES) {
    process.stdout.write(`  ${caseDef.id} (${caseDef.category}, ${caseDef.split})... `);
    const result = await runCase(caseDef);
    results.push(result);
    console.log(result.error ? `ERROR — ${result.error}` : result.pass ? "PASS" : `FAIL — ${JSON.stringify(result.checks)}`);
  }

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;

  const metrics = {
    heldOut: computeMetrics(
      results.filter((r) => r.split === "held_out"),
      allCasesById
    ),
    dev: computeMetrics(
      results.filter((r) => r.split === "dev"),
      allCasesById
    ),
    overall: computeMetrics(results, allCasesById),
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
  console.log(`Held-out metrics (production-proof): ${JSON.stringify(metrics.heldOut, null, 2)}`);
  console.log(`Dev metrics (tuning only, not proof): ${JSON.stringify(metrics.dev, null, 2)}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
