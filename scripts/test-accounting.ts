/**
 * End-to-end proof that Phase 5 (QuickBooks Online sandbox integration)
 * works for real: submits the "clean-match" demo scenario through the real
 * intake API and job processor (same as run-demo-pipeline.ts) until it
 * lands on ready_for_approval with a proposed accounting change, then calls
 * the real QBO sandbox to create a draft bill from it, then replays the
 * exact same decision to prove that no duplicate bill is created.
 *
 * Requires a QuickBooks Online sandbox connection already on file — run
 * this locally after completing
 * /api/accounting/qbo/connect?token=<ADMIN_SETUP_TOKEN> in a browser.
 *
 *   npm run test-accounting
 */
import { SCENARIOS } from "@/lib/fixtures/scenarios";
import { submitInvoice } from "@/lib/workflow/submit-invoice";
import { processNextInvoiceJob } from "@/lib/workflow/process-invoice-job";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getActiveConnection, createDraftBill } from "@/lib/accounting/qbo-client";
import type { AccountingChangeSet } from "@/lib/types";

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`    ✓ ${label}`);
  } else {
    failures++;
    console.log(`    ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const SCENARIO_ID = "clean-match"; // the only seeded scenario that reaches ready_for_approval

async function main() {
  const db = supabaseAdmin();

  console.log("=== Checking QuickBooks Online sandbox connection ===");
  try {
    const conn = await getActiveConnection(db);
    console.log(`  ✓ connected — realmId=${conn.realm_id}, environment=${conn.environment}\n`);
  } catch (err) {
    console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
    console.error("\nConnect first: visit /api/accounting/qbo/connect?token=<ADMIN_SETUP_TOKEN> in a browser, then re-run.");
    process.exit(1);
  }

  const scenario = SCENARIOS.find((s) => s.id === SCENARIO_ID);
  if (!scenario) throw new Error(`Scenario "${SCENARIO_ID}" not found in fixtures.`);

  // Same cleanup convention as run-demo-pipeline.ts's sub_pipeline_* rows —
  // this script owns sub_accounting_test_*, and ALSO clears any leftover
  // sub_pipeline_clean-match_* row: that scenario's fixture PDF always
  // carries the same invoice number/supplier/total, so a stale row from a
  // prior `run-demo-pipeline` run would otherwise correctly trip duplicate
  // detection against this script's own fresh submission. Never touches
  // seeded historical data (sub_hist_*) or any other scenario's rows.
  const { error: cleanupError } = await db.from("invoices").delete().like("submission_id", "sub_accounting_test_%");
  const { error: cleanupPipelineError } = await db.from("invoices").delete().like("submission_id", "sub_pipeline_clean-match_%");
  if (cleanupError || cleanupPipelineError) {
    console.error(`Cleanup of prior test rows failed: ${cleanupError?.message ?? cleanupPipelineError?.message}`);
    process.exit(1);
  }
  console.log("Cleaned up any prior sub_accounting_test_* and sub_pipeline_clean-match_* invoices.\n");

  console.log(`=== ${scenario.title} (${scenario.id}) — extraction, matching, decision ===`);
  const submissionId = `sub_accounting_test_${scenario.id}_${Date.now()}`;
  const submission = await submitInvoice({
    submissionId,
    source: "demo_scenario",
    originalFileName: `${scenario.id}.pdf`,
    fileHash: `sha256:accounting-test-${scenario.id}`,
    mimeType: "application/pdf",
    receivedAt: new Date().toISOString(),
  });
  check("intake created a new (non-replay) row", submission.isReplay === false);

  await db.from("invoices").update({ storage_path: `demo-scenarios/${scenario.id}.pdf` }).eq("id", submission.invoiceId);

  let jobResult = await processNextInvoiceJob();
  let drainAttempts = 0;
  while (jobResult.processed && "invoiceId" in jobResult && jobResult.invoiceId !== submission.invoiceId && drainAttempts < 20) {
    jobResult = await processNextInvoiceJob();
    drainAttempts++;
  }
  check("job processor processed this submission's invoice", jobResult.processed === true && "invoiceId" in jobResult && jobResult.invoiceId === submission.invoiceId);
  if (jobResult.processed && "error" in jobResult) {
    check("job did not error", false, jobResult.error);
    console.log(`\nFAIL: ${failures} failing check(s) — cannot proceed to accounting without a processed invoice.`);
    process.exit(1);
  }

  const { data: invoice, error: invoiceError } = await db.from("invoices").select("*").eq("id", submission.invoiceId).single();
  check("invoice row fetched after processing", !invoiceError && !!invoice, invoiceError?.message);
  check(`outcome is ready_for_approval (expected for "${scenario.id}")`, invoice?.status === "ready_for_approval", `got "${invoice?.status}"`);
  if (!invoice || invoice.status !== "ready_for_approval") {
    console.log(`\nFAIL: ${failures} failing check(s) — scenario didn't reach the outcome this test depends on.`);
    process.exit(1);
  }

  const { data: decisionRow, error: decisionError } = await db.from("decisions").select("*").eq("invoice_id", invoice.id).single();
  check("decisions row fetched", !decisionError && !!decisionRow, decisionError?.message);
  const changeSet = decisionRow?.proposed_accounting_change as unknown as AccountingChangeSet | null;
  check("decision carries a proposed accounting change", !!changeSet && changeSet.action === "create_bill");
  if (!decisionRow || !changeSet) {
    console.log(`\nFAIL: ${failures} failing check(s) — no accounting change to post.`);
    process.exit(1);
  }

  const { data: supplierRow } = await db.from("suppliers").select("name").eq("id", changeSet.supplierId).single();
  const supplierName = supplierRow?.name ?? scenario.supplier.name;
  console.log(`  proposed change → idempotencyKey=${changeSet.idempotencyKey}, total=${changeSet.total}, supplier="${supplierName}"\n`);

  console.log("=== Creating draft bill in QuickBooks Online sandbox ===");
  const firstAttempt = await createDraftBill(db, changeSet, {
    invoiceId: invoice.id,
    decisionId: decisionRow.id,
    supplierName,
  });
  check("bill created (not a replay)", firstAttempt.alreadyExisted === false);
  check("accounting_bills row status is created", firstAttempt.billRow.status === "created", firstAttempt.billRow.error_message ?? undefined);
  check("accounting_bills row has an external_bill_id", !!firstAttempt.billRow.external_bill_id);
  console.log(`  external_bill_id=${firstAttempt.billRow.external_bill_id}, external_doc_number=${firstAttempt.billRow.external_doc_number}\n`);

  console.log("=== Replaying the identical decision — must not create a second bill ===");
  const secondAttempt = await createDraftBill(db, changeSet, {
    invoiceId: invoice.id,
    decisionId: decisionRow.id,
    supplierName,
  });
  check("replay is detected (alreadyExisted)", secondAttempt.alreadyExisted === true);
  check(
    "replay returns the same external_bill_id — no duplicate bill",
    secondAttempt.billRow.external_bill_id === firstAttempt.billRow.external_bill_id,
    `first=${firstAttempt.billRow.external_bill_id} second=${secondAttempt.billRow.external_bill_id}`
  );

  const { count: billRowCount } = await db
    .from("accounting_bills")
    .select("id", { count: "exact", head: true })
    .eq("idempotency_key", changeSet.idempotencyKey);
  check("exactly one accounting_bills row exists for this idempotency key", billRowCount === 1, `got ${billRowCount}`);

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} failing check(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
