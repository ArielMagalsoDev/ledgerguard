import type { Metadata } from "next";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { EVAL_CASES, EVAL_DATASET_NOTE, CATEGORY_META, type EvalCategory } from "@/evals/cases";
import { getLatestEvalRun } from "@/lib/evals/latest-run";

export const metadata: Metadata = {
  title: "Evaluations — Ledger Guard",
  description: "Extraction and control scorecard.",
};

export const dynamic = "force-dynamic";

// Metrics the real runner (evals/run.ts) computes today, mapped to their
// CLAUDE.md section 15 acceptance target where one exists.
const COMPUTED_METRICS: Array<{ key: string; label: string; target: string; format: "pct" | "ms" | "usd" }> = [
  { key: "outcomeAccuracy", label: "Exception-routing / outcome accuracy", target: "≥ 95%", format: "pct" },
  { key: "headerFieldAccuracy", label: "Header-field accuracy (invoice number)", target: "≥ 97%", format: "pct" },
  { key: "monetaryFieldAccuracy", label: "Monetary-field accuracy (total)", target: "≥ 99%", format: "pct" },
  { key: "lineItemFieldAccuracy", label: "Line-item extraction accuracy", target: "≥ 95%", format: "pct" },
  { key: "evidenceCoordinateValidity", label: "Evidence-coordinate validity", target: "≥ 98%", format: "pct" },
  { key: "unsupportedFieldRate", label: "Unsupported-field rate", target: "< 1%", format: "pct" },
  { key: "supplierMatchAccuracy", label: "Supplier-match accuracy", target: "n/a", format: "pct" },
  { key: "poMatchAccuracy", label: "PO-line match accuracy", target: "n/a", format: "pct" },
  { key: "duplicatePrecision", label: "Duplicate precision", target: "≥ 98%", format: "pct" },
  { key: "duplicateRecall", label: "Duplicate recall", target: "100%", format: "pct" },
  { key: "falseClearanceRate", label: "Critical-control false-clearance rate", target: "0%", format: "pct" },
  { key: "falseHoldRate", label: "False-hold rate", target: "n/a", format: "pct" },
  { key: "injectionDefenseHoldRate", label: "Injection defense hold rate (outcome unchanged by injected text)", target: "100%", format: "pct" },
  { key: "meanLatencyMs", label: "Mean latency per case", target: "n/a", format: "ms" },
  { key: "meanCostUsd", label: "Mean model cost per case", target: "n/a", format: "usd" },
];

function formatMetric(value: unknown, format: "pct" | "ms" | "usd"): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  if (format === "pct") return `${(value * 100).toFixed(1)}%`;
  if (format === "ms") return `${(value / 1000).toFixed(1)}s`;
  return `$${value.toFixed(4)}`;
}

function MetricsTable({ metrics, caseCount }: { metrics: Record<string, unknown>; caseCount: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <tbody className="divide-y divide-rule">
          {COMPUTED_METRICS.map((m) => (
            <tr key={m.key}>
              <td className="py-2 pr-6 text-ink-muted">{m.label}</td>
              <td className="py-2 pr-6 text-right font-tabular font-medium text-ink">{formatMetric(metrics[m.key], m.format)}</td>
              <td className="py-2 text-right font-tabular text-xs text-ink-faint">{m.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-faint">Over {caseCount} case(s).</p>
    </div>
  );
}

export default async function EvalsPage() {
  const run = await getLatestEvalRun();

  const categoryCounts = new Map<EvalCategory, number>();
  const heldOutCounts = new Map<EvalCategory, number>();
  for (const c of EVAL_CASES) {
    categoryCounts.set(c.category, (categoryCounts.get(c.category) ?? 0) + 1);
    if (c.split === "held_out") heldOutCounts.set(c.category, (heldOutCounts.get(c.category) ?? 0) + 1);
  }

  const metricsRoot = (run?.metrics ?? {}) as { heldOut?: Record<string, unknown>; dev?: Record<string, unknown> };
  const heldOutMetrics = metricsRoot.heldOut ?? {};
  const devMetrics = metricsRoot.dev ?? {};
  const perCase = (run?.per_case ?? []) as Array<{
    caseId: string;
    category: string;
    title: string;
    split?: "dev" | "held_out";
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
              <h2 className="font-display text-xl font-semibold text-ink">Held-out metrics — production proof</h2>
              <span className={`font-tabular text-sm font-semibold ${run.passed_cases === run.total_cases ? "text-ready" : "text-exception"}`}>
                {run.passed_cases}/{run.total_cases} cases passed overall
              </span>
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              {new Date(run.created_at).toLocaleString()} · policy {run.policy_version} · these numbers are computed only
              over the held-out split — cases never used to tune anything. CLAUDE.md section 15: a dev-set score is
              never presented as production proof.
            </p>
            <div className="mt-4">
              <MetricsTable metrics={heldOutMetrics} caseCount={(heldOutMetrics.caseCount as number) ?? 0} />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold text-ink">Dev-set metrics — tuning only, not proof</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">
              The larger split (~80% of cases per category). Useful for catching regressions while iterating; never
              cited as the production number.
            </p>
            <div className="mt-4">
              <MetricsTable metrics={devMetrics} caseCount={(devMetrics.caseCount as number) ?? 0} />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-lg font-semibold text-ink">Per-case results</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 pr-4 font-medium">Case</th>
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 pr-4 font-medium">Split</th>
                    <th className="pb-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {perCase.map((c) => (
                    <tr key={c.caseId}>
                      <td className="py-2.5 pr-4 text-ink">{c.title}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">{CATEGORY_META[c.category as EvalCategory]?.label ?? c.category}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            c.split === "held_out" ? "bg-[var(--ready-bg)] text-ready" : "bg-paper-raised text-ink-faint"
                          }`}
                        >
                          {c.split === "held_out" ? "Held-out" : "Dev"}
                        </span>
                      </td>
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
          , stated honestly rather than padded. Categories under 5 cases don&rsquo;t get a held-out split — too few to
          divide meaningfully — a real limitation, not hidden.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-4 font-medium">Category</th>
                <th className="pb-2 pr-4 text-right font-medium">Today</th>
                <th className="pb-2 pr-4 text-right font-medium">Held-out</th>
                <th className="pb-2 pr-4 text-right font-medium">v1 target</th>
                <th className="pb-2 text-right font-medium">Full target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {(Object.keys(CATEGORY_META) as EvalCategory[]).map((cat) => {
                const meta = CATEGORY_META[cat];
                const today = categoryCounts.get(cat) ?? 0;
                const heldOut = heldOutCounts.get(cat) ?? 0;
                return (
                  <tr key={cat}>
                    <td className="py-2 pr-4 text-ink-muted">{meta.label}</td>
                    <td className={`py-2 pr-4 text-right font-tabular ${today >= meta.v1Target ? "text-ready" : "text-ink"}`}>{today}</td>
                    <td className="py-2 pr-4 text-right font-tabular text-ink-faint">{heldOut}</td>
                    <td className="py-2 pr-4 text-right font-tabular text-ink-faint">{meta.v1Target}</td>
                    <td className="py-2 text-right font-tabular text-ink-faint">{meta.fullTarget}</td>
                  </tr>
                );
              })}
              <tr className="font-medium">
                <td className="py-2 pr-4 text-ink">Total</td>
                <td className="py-2 pr-4 text-right font-tabular text-ink">{EVAL_DATASET_NOTE.currentCount}</td>
                <td className="py-2 pr-4 text-right font-tabular text-ink">{Array.from(heldOutCounts.values()).reduce((a, b) => a + b, 0)}</td>
                <td className="py-2 pr-4 text-right font-tabular text-ink">{EVAL_DATASET_NOTE.v1Target}</td>
                <td className="py-2 text-right font-tabular text-ink">{EVAL_DATASET_NOTE.fullTarget}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-xs text-ink-faint">
          Dev and held-out sets are separated (evals/cases.ts's assignSplits) — stratified per category, ~20% held out
          where a category has 5+ cases. The held-out numbers above are what CLAUDE.md section 15 means by production
          proof; dev numbers are for tuning and are shown separately, never blended into a single headline figure.
        </p>
      </section>
    </div>
  );
}
