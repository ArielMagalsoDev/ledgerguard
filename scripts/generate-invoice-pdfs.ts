/**
 * Generates a real, extractable PDF for each of the 5 guided-demo scenarios
 * and uploads it to the invoice-documents Storage bucket. Run whenever the
 * scenario fixtures change — the pipeline scripts assume these PDFs exist
 * at demo-scenarios/<scenarioId>.pdf.
 *
 *   npm run generate-pdfs
 */
import fs from "node:fs";
import path from "node:path";
import { SCENARIOS } from "@/lib/fixtures/scenarios";
import { generateInvoicePdf } from "@/lib/extraction/pdf-generate";
import { supabaseAdmin } from "@/lib/supabase/server";

async function main() {
  const outDir = path.join(process.cwd(), "fixtures", "pdfs");
  fs.mkdirSync(outDir, { recursive: true });

  const db = supabaseAdmin();

  for (const scenario of SCENARIOS) {
    const bytes = await generateInvoicePdf(scenario.documentLines);
    const localPath = path.join(outDir, `${scenario.id}.pdf`);
    fs.writeFileSync(localPath, bytes);

    const storagePath = `demo-scenarios/${scenario.id}.pdf`;
    const { error } = await db.storage
      .from("invoice-documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });

    if (error) {
      console.error(`✗ ${scenario.id}: upload failed — ${error.message}`);
      process.exitCode = 1;
      continue;
    }

    console.log(`✓ ${scenario.id}: ${bytes.byteLength} bytes → fixtures/pdfs/${scenario.id}.pdf + storage:${storagePath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
