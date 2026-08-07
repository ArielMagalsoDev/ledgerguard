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
  const { data } = await db.from("eval_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as EvalRunRow | null) ?? null;
}
