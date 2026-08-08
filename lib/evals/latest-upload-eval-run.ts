import { supabaseAdmin } from "@/lib/supabase/server";
import type { EvalRunRow } from "@/lib/evals/latest-run";

/**
 * The latest scripts/run-upload-evals.ts result — distinguished from the
 * seeded-scenario runs by the run_label prefix (same convention as
 * evals/run.ts's own "sub_eval_" invoice-submission prefix). Kept as a
 * separate query, not a filter option on getLatestEvalRun(), so the two
 * result sets can never accidentally get blended into one number on
 * /evals — Phase 4's "never blended into production-proof numbers" rule.
 */
export async function getLatestUploadEvalRun(): Promise<EvalRunRow | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("eval_runs")
    .select("*")
    .like("run_label", "upload_sandbox_%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as EvalRunRow | null) ?? null;
}
