/**
 * End-to-end proof that Phases 2+3+4 work together for real: submits each of
 * the 5 demo-scenario PDFs through the actual idempotent intake API, points
 * each invoice at its uploaded PDF, drains the job queue with the real job
 * processor (extraction → alignment → arithmetic → matching → decision),
 * and asserts each one lands on the outcome CLAUDE.md's guided demo actually
 * specifies for it. Real Claude calls, real Supabase writes, no fixtures.
 *
 *   npm run run-demo-pipeline
 */
import { SCENARIOS } from "@/lib/fixtures/scenarios";
import { submitInvoice } from "@/lib/workflow/submit-invoice";
import { processNextInvoiceJob } from "@/lib/workflow/process-invoice-job";
import { supabaseAdmin } from "@/lib/supabase/server";

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`    ✓ ${label}`);
  } else {
    failures++;
    console.log(`    ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const db = supabaseAdmin();

  // Each run submits fresh invoices carrying the SAME business identity
  // (invoice number, date, total) as the fixture PDF's own printed content —
  // that's deliberate, it's what proves extraction is real. But it means a
  // second run of this script (or scripts/test-accounting.ts, which submits
  // the same clean-match identity to reach ready_for_approval) would
  // otherwise duplicate-match a prior run's rows. Clean up both scripts'
  // prior test rows — never the seeded historical data (in particular,
  // never sub_apc_88213_original, which scenario 3's duplicate check is
  // specifically seeded to depend on).
  //
  // accounting_bills/review_actions reference invoices with NO ACTION (not
  // CASCADE) — deleting an invoice that already has a draft bill or a review
  // action on file fails with a foreign-key violation unless those rows go
  // first. jobs/controls/decisions/audit_events DO cascade.
  const { data: staleInvoices, error: staleError } = await db
    .from("invoices")
    .select("id")
    .or("submission_id.like.sub_pipeline_%,submission_id.like.sub_accounting_test_%");
  if (staleError) {
    console.error(`Cleanup of prior test rows failed: ${staleError.message}`);
    process.exit(1);
  }
  const staleIds = (staleInvoices ?? []).map((r) => r.id);
  if (staleIds.length > 0) {
    await db.from("accounting_bills").delete().in("invoice_id", staleIds);
    await db.from("review_actions").delete().in("invoice_id", staleIds);
    const { error: cleanupError } = await db.from("invoices").delete().in("id", staleIds);
    if (cleanupError) {
      console.error(`Cleanup of prior test rows failed: ${cleanupError.message}`);
      process.exit(1);
    }
  }
  console.log(`Cleaned up ${staleIds.length} prior sub_pipeline_* / sub_accounting_test_* test invoice(s).\n`);

  for (const scenario of SCENARIOS) {
    console.log(`\n=== ${scenario.title} (${scenario.id}) ===`);

    const submissionId = `sub_pipeline_${scenario.id}_${Date.now()}`;
    const submission = await submitInvoice({
      submissionId,
      source: "demo_scenario",
      originalFileName: `${scenario.id}.pdf`,
      fileHash: `sha256:pipeline-${scenario.id}`,
      mimeType: "application/pdf",
      receivedAt: new Date().toISOString(),
      // Phase 6: this is what lets /demo and /queue find "the current live
      // instance of this scenario" instead of reading static fixture data.
      scenarioKey: scenario.id,
    });
    console.log(`  submitted → invoiceId=${submission.invoiceId} isReplay=${submission.isReplay}`);
    check("intake created a new (non-replay) row", submission.isReplay === false);

    const { error: pathError } = await db
      .from("invoices")
      .update({ storage_path: `demo-scenarios/${scenario.id}.pdf` })
      .eq("id", submission.invoiceId);
    check("storage_path set", !pathError, pathError?.message);

    // The queue is FIFO by created_at — drain anything older first (e.g. a
    // leftover job from a prior manual test) until we reach the job this
    // submission just enqueued. Bounded so a real stuck queue still fails loudly.
    let jobResult = await processNextInvoiceJob();
    let drainAttempts = 0;
    while (jobResult.processed && "invoiceId" in jobResult && jobResult.invoiceId !== submission.invoiceId && drainAttempts < 20) {
      console.log(`  (drained older job for ${jobResult.invoiceId}) → ${JSON.stringify(jobResult)}`);
      jobResult = await processNextInvoiceJob();
      drainAttempts++;
    }

    console.log(`  processed → ${JSON.stringify(jobResult)}`);
    check("job processor actually processed something", jobResult.processed === true);
    check(
      "processed job belongs to this scenario's invoice",
      jobResult.processed && "invoiceId" in jobResult && jobResult.invoiceId === submission.invoiceId,
      jobResult.processed && "invoiceId" in jobResult ? jobResult.invoiceId : "n/a"
    );
    if (jobResult.processed && "error" in jobResult) {
      check("job did not error", false, jobResult.error);
      continue;
    }

    const { data: invoice, error: fetchError } = await db
      .from("invoices")
      .select("*")
      .eq("id", submission.invoiceId)
      .single();
    check("invoice row fetched after processing", !fetchError && !!invoice, fetchError?.message);
    if (!invoice) continue;

    const extracted = invoice.extracted as Record<string, { value: string | null; status: string }>;
    console.log(
      `  extracted invoiceNumber=${extracted.invoiceNumber?.value} (${extracted.invoiceNumber?.status}), total=${extracted.total?.value} (${extracted.total?.status})`
    );

    check(
      "extracted invoice number matches the fixture's own value",
      extracted.invoiceNumber?.value === scenario.extracted.invoiceNumber.value,
      `got ${extracted.invoiceNumber?.value}, expected ${scenario.extracted.invoiceNumber.value}`
    );
    check(
      "extracted total matches the fixture's own value",
      extracted.total?.value === scenario.extracted.total.value,
      `got ${extracted.total?.value}, expected ${scenario.extracted.total.value}`
    );
    check("invoice number field is verified (real evidence found in the PDF)", extracted.invoiceNumber?.status === "verified");
    check("total field is verified (real evidence found in the PDF)", extracted.total?.status === "verified");

    const { data: controls } = await db.from("controls").select("*").eq("invoice_id", submission.invoiceId);
    check("at least 3 arithmetic control rows written", (controls?.length ?? 0) >= 3, `got ${controls?.length}`);

    const { data: auditEvents } = await db
      .from("audit_events")
      .select("stage")
      .eq("invoice_id", submission.invoiceId);
    const stages = new Set((auditEvents ?? []).map((e) => e.stage));
    for (const expectedStage of [
      "submission_received",
      "file_validated",
      "extraction_complete",
      "evidence_aligned",
      "arithmetic_checked",
      "supplier_matched",
      "duplicate_checked",
      "source_screened",
      "decision_made",
    ]) {
      check(`audit trail includes "${expectedStage}"`, stages.has(expectedStage));
    }

    // The actual Phase 4 acceptance criterion: does this scenario land on the
    // outcome CLAUDE.md's guided demo specifies for it?
    console.log(`  decision → outcome=${invoice.status}`);
    check(
      `final outcome matches the spec's guided scenario (expected "${scenario.outcome}")`,
      invoice.status === scenario.outcome,
      `got "${invoice.status}"`
    );

    const { data: decisionRow } = await db.from("decisions").select("*").eq("invoice_id", submission.invoiceId).maybeSingle();
    check("a decisions row was written", !!decisionRow);
    check("decisions row outcome matches invoice status", decisionRow?.outcome === invoice.status);

    const { data: matchRow } = await db.from("match_results").select("*").eq("invoice_id", submission.invoiceId).maybeSingle();
    check("a match_results row was written", !!matchRow);
    check("supplier match tier is exact (all 5 scenario suppliers are seeded)", matchRow?.supplier_match === "exact", matchRow?.supplier_match);

    // Replay check: same submissionId again must not create a second job or row.
    const replay = await submitInvoice({
      submissionId,
      source: "demo_scenario",
      originalFileName: `${scenario.id}.pdf`,
      fileHash: `sha256:pipeline-${scenario.id}`,
      mimeType: "application/pdf",
      receivedAt: new Date().toISOString(),
      scenarioKey: scenario.id,
    });
    check("replaying the same submissionId is detected", replay.isReplay === true);
    check("replay returns the same invoiceId", replay.invoiceId === submission.invoiceId);
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} failing check(s) across ${SCENARIOS.length} scenarios`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
