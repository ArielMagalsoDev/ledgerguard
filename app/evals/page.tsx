import type { Metadata } from "next";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { EVAL_CASES, EVAL_DATASET_NOTE, CATEGORY_META, type EvalCategory } from "@/evals/cases";
import { getLatestEvalRun } from "@/lib/evals/latest-run";

export const metadata: Metadata = {
  title: "Evaluations — LedgerGuard",
  description: "Extraction and control scorecard.",
};

export const dynamic = "force-dynamic";

// Metrics the real runner (evals/run.ts) actually computes today, mapped to
// their CLAUDE.md section 15 acceptance target where one exists.
const COMPUTED_METRICS: Array<{ key: string; label: string; target: string; format: "pct" | "ms" | "usd" }> = [
  { key: "outcomeAccuracy", label: "Exception-routing / outcome accuracy", target: "≥ 95%", format: "pct" },
  { key: "headerFieldAccuracy", label: "Header-field accuracy (invoice number)", target: "≥ 97%", format: "pct" },
  { key: "monetaryFieldAccuracy", label: "Monetary-field accuracy (total)", target: "≥ 99%", format: "pct" },
  { key: "supplierMatchAccuracy", label: "Supplier-match accuracy", target: "n/a", format: "pct" },
  { key: "poMatchAccuracy", label: "PO-line match accuracy", target: "n/a", format: "pct" },
  { key: "falseClearanceRate", label: "Critical-control false-clearance rate", target: "0% (held-out set)", format: "pct" },
  { key: "falseHoldRate", label: "False-hold rate", target: "n/a", format: "pct" },
  { key: "injectionDefenseHoldRate", label: "Injection defense hold rate (outcome unchanged by injected text)", target: "100%", format: "pct" },
  { key: "meanLatencyMs", label: "Mean latency per case", target: "n/a", format: "ms" },
  { key: "meanCostUsd", label: "Mean model cost per case", target: "n/a", format: "usd" },
];

// Spec'd in CLAUDE.md section 15 but not yet computed by evals/run.ts —
// stated rather than silently omitted or faked.
const NOT_YET_COMPUTED = [
  "Line-item extraction accuracy (per-line, not just header/total)",
  "Evidence-coordinate validity",
  "Duplicate precision/recall (evals/run.ts checks outcome only, not signal-level precision)",
  "Unsupported-field rate",
];

function formatMetric(value: unknown, format: "pct" | "ms" | "usd"): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  if (format === "pct") return `${(value * 100).toFixed(1)}%`;
  if (format === "ms") return `${(value / 1000).toFixed(1)}s`;
  return `$${value.toFixed(4)}`;
}

export default async function EvalsPage() {
  const run = await getLatestEvalRun();

  const categoryCounts = new Map<EvalCategory, number>();
  for (const c of EVAL_CASES) categoryCounts.set(c.category, (categoryCounts.get(c.category) ?? 0) + 1);

  const metrics = (run?.metrics ?? {}) as Record<string, unknown>;
  const perCase = (run?.per_case ?? []) as Array<{
    caseId: string;
    category: string;
    title: string;
    pass: boolean;
    error?: string;
    checks: Record<string, boolean>;
  }>;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl font-semibold text-ink">Evaluations</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        A real eval harness (<code className="font-tabular text-xs">npm run run-evals</code>) submits every case in{" "}
        <code className="font-tabular text-xs">evals/cases.ts</code> through the actual pipeline — extraction, evidence
        alignment, matching, and decision — and scores the result against labeled ground truth. What&rsquo;s below is
        the latest real run, not a mock.
      </p>

      {!run && (
        <p className="mt-6 rounded border border-rule bg-paper-raised/50 px-4 py-3 text-sm text-ink-muted">
          No eval run yet — run <code className="font-tabular text-xs">npm run run-evals</code> to populate this page.
        </p>
      )}

      {run && (
        <>
          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-strong pb-2">
              <h2 className="font-display text-xl font-semibold text-ink">Latest run</h2>
              <span className={`font-tabular text-sm font-semibold ${run.passed_cases === run.total_cases ? "text-ready" : "text-exception"}`}>
                {run.passed_cases}/{run.total_cases} cases passed
              </span>
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              {new Date(run.created_at).toLocaleString()} · policy {run.policy_version}
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <tbody className="divide-y divide-rule">
                  {COMPUTED_METRICS.map((m) => (
                    <tr key={m.key}>
                      <td className="py-2.5 pr-6 text-ink-muted">{m.label}</td>
                      <td className="py-2.5 pr-6 text-right font-tabular font-medium text-ink">{formatMetric(metrics[m.key], m.format)}</td>
                      <td className="py-2.5 text-right font-tabular text-xs text-ink-faint">{m.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold text-ink">Per-case results</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 pr-4 font-medium">Case</th>
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {perCase.map((c) => (
                    <tr key={c.caseId}>
                      <td className="py-2.5 pr-4 text-ink">{c.title}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">{CATEGORY_META[c.category as EvalCategory]?.label ?? c.category}</td>
                      <td className="py-2.5">
                        {c.error ? (
                          <span className="inline-flex items-center gap-1.5 text-blocked" title={c.error}>
                            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                            Error
                          </span>
                        ) : c.pass ? (
                          <span className="inline-flex items-center gap-1.5 text-ready">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-blocked" title={JSON.stringify(c.checks)}>
                            <XCircle className="h-3.5 w-3.5" aria-hidden />
                            Fail — {Object.entries(c.checks).filter(([, v]) => !v).map(([k]) => k).join(", ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Dataset */}
      <section className="mt-14">
        <h2 className="font-display text-xl font-semibold text-ink">Labeled dataset</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Target: {EVAL_DATASET_NOTE.fullTarget} fictional labeled documents. v1 target is a{" "}
          {EVAL_DATASET_NOTE.v1Target}-case slice (3 per category) —{" "}
          <strong className="text-ink">
            {EVAL_DATASET_NOTE.currentCount} case{EVAL_DATASET_NOTE.currentCount === 1 ? "" : "s"} exist today
          </strong>
          , stated honestly rather than padded. Growing this set is ongoing work; the runner and metrics pipeline are
          what had to be right first, and are exercised for real against every case that exists.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-4 font-medium">Category</th>
                <th className="pb-2 pr-4 text-right font-medium">Today</th>
                <th className="pb-2 pr-4 text-right font-medium">v1 target</th>
                <th className="pb-2 text-right font-medium">Full target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {(Object.keys(CATEGORY_META) as EvalCategory[]).map((cat) => {
                const meta = CATEGORY_META[cat];
                const today = categoryCounts.get(cat) ?? 0;
                return (
                  <tr key={cat}>
                    <td className="py-2 pr-4 text-ink-muted">{meta.label}</td>
                    <td className={`py-2 pr-4 text-right font-tabular ${today >= meta.v1Target ? "text-ready" : "text-ink"}`}>{today}</td>
                    <td className="py-2 pr-4 text-right font-tabular text-ink-faint">{meta.v1Target}</td>
                    <td className="py-2 text-right font-tabular text-ink-faint">{meta.fullTarget}</td>
                  </tr>
                );
              })}
              <tr className="font-medium">
                <td className="py-2 pr-4 text-ink">Total</td>
                <td className="py-2 pr-4 text-right font-tabular text-ink">{EVAL_DATASET_NOTE.currentCount}</td>
                <td className="py-2 pr-4 text-right font-tabular text-ink">{EVAL_DATASET_NOTE.v1Target}</td>
                <td className="py-2 text-right font-tabular text-ink">{EVAL_DATASET_NOTE.fullTarget}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 mb-8">
        <h2 className="font-display text-xl font-semibold text-ink">Not yet computed by the runner</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Spec&rsquo;d in CLAUDE.md section 15, not yet in evals/run.ts — stated rather than silently omitted.
        </p>
        <ul className="mt-4 space-y-2">
          {NOT_YET_COMPUTED.map((c) => (
            <li key={c} className="flex gap-2.5 text-sm text-ink-muted">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-ink-faint">
          Development and held-out sets are not yet separated — every case in evals/cases.ts is currently a dev-set
          case. A tuned dev-set score is never presented as production proof; that separation is real future work,
          not a nuance to gloss over once the dataset grows past this initial slice.
        </p>
      </section>
    </div>
  );
}
