import { supabaseAdmin } from "@/lib/supabase/server";

export type EvalRunRow = {
  id: string;
  run_label: string;
  policy_version: string;
  total_cases: number;
  passed_cases: number;
  metrics: Record<string, unknown>;
  per_case: Array<Record<string, unknown>>;
  created_at: string;
};

export async function getLatestEvalRun(): Promise<EvalRunRow | null> {
  const db = supabaseAdmin();
  // Excludes upload_sandbox_* rows (scripts/run-upload-evals.ts) — without
  // this, the single most-recent eval_runs row could be an upload-sandbox
  // validation run instead of a seeded-pipeline run, silently substituting
  // its pass count and "n/a" metrics into the page's production-proof
  // section. Caught by inspection after adding the upload-eval runner;
  // see lib/evals/latest-upload-eval-run.ts for its dedicated query.
  const { data } = await db
    .from("eval_runs")
    .select("*")
    .not("run_label", "like", "upload_sandbox_%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as EvalRunRow | null) ?? null;
}
