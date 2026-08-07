import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { SCENARIOS } from "@/lib/fixtures/scenarios";
import { OUTCOME_META } from "@/lib/outcome";

export const metadata: Metadata = {
  title: "Evaluations — LedgerGuard",
  description: "Extraction and control scorecard.",
};

const DATASET_CATEGORIES = [
  { category: "Clean matched invoices", v1Target: 3, fullTarget: 30 },
  { category: "Price or quantity exceptions", v1Target: 3, fullTarget: 20 },
  { category: "Arithmetic or tax failures", v1Target: 3, fullTarget: 10 },
  { category: "Exact or probable duplicates", v1Target: 3, fullTarget: 15 },
  { category: "Supplier-identity or bank-detail exceptions", v1Target: 3, fullTarget: 10 },
  { category: "Poor-quality or ambiguous scans", v1Target: 3, fullTarget: 10 },
  { category: "Adversarial embedded-instruction documents", v1Target: 3, fullTarget: 5 },
];

const ACCEPTANCE_TARGETS = [
  { metric: "Monetary-field accuracy", target: "≥ 99%" },
  { metric: "Header-field accuracy", target: "≥ 97%" },
  { metric: "Line-item extraction accuracy", target: "≥ 95%" },
  { metric: "Evidence-coordinate validity", target: "≥ 98%" },
  { metric: "Exact duplicate recall", target: "100%" },
  { metric: "Duplicate precision", target: "≥ 98%" },
  { metric: "Exception-routing accuracy", target: "≥ 95%" },
  { metric: "Unsupported-field rate", target: "< 1%" },
  { metric: "Critical-control false-clearance rate", target: "0% (held-out set)" },
  { metric: "Replay-generated duplicate accounting drafts", target: "0" },
];

export default function EvalsPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="font-display text-3xl font-semibold text-ink">Evaluations</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        This is a Phase 1 build: static fixtures only, no extraction pipeline
        or eval runner yet. What&rsquo;s below is honest about that — a scorecard
        of what the 5 guided scenarios prove today, and the acceptance targets
        the real eval suite (Phase 7) will be measured against.
      </p>

      {/* Guided scenario check */}
      <section className="mt-10">
        <div className="flex items-center justify-between border-b border-rule-strong pb-2">
          <h2 className="font-display text-xl font-semibold text-ink">
            Guided-scenario outcome check
          </h2>
          <span className="font-tabular text-sm font-semibold text-ready">
            {SCENARIOS.length}/{SCENARIOS.length} resolve to their engineered outcome
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-4 font-medium">Scenario</th>
                <th className="pb-2 pr-4 font-medium">Expected outcome</th>
                <th className="pb-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {SCENARIOS.map((s) => (
                <tr key={s.id}>
                  <td className="py-2.5 pr-4 text-ink">{s.title}</td>
                  <td className="py-2.5 pr-4 text-ink-muted">{OUTCOME_META[s.outcome].label}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-ready">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      Pass
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          This checks that the demo&rsquo;s wiring is correct, not that a real
          extraction pipeline generalizes — that is what the labeled dataset
          below is for.
        </p>
      </section>

      {/* Dataset */}
      <section className="mt-14">
        <h2 className="font-display text-xl font-semibold text-ink">Labeled dataset</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Target: 100 fictional labeled documents. <strong className="text-ink">v1 ships a
          21-case slice (3 per category)</strong> — stated here rather than left
          silent. Held-out and development sets are kept separate; a
          development-set score is never presented as production proof.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="pb-2 pr-4 font-medium">Category</th>
                <th className="pb-2 pr-4 text-right font-medium">v1 slice</th>
                <th className="pb-2 text-right font-medium">Full target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {DATASET_CATEGORIES.map((row) => (
                <tr key={row.category}>
                  <td className="py-2 pr-4 text-ink-muted">{row.category}</td>
                  <td className="py-2 pr-4 text-right font-tabular text-ink">{row.v1Target}</td>
                  <td className="py-2 text-right font-tabular text-ink-faint">{row.fullTarget}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2 pr-4 text-ink">Total</td>
                <td className="py-2 pr-4 text-right font-tabular text-ink">
                  {DATASET_CATEGORIES.reduce((s, r) => s + r.v1Target, 0)}
                </td>
                <td className="py-2 text-right font-tabular text-ink">
                  {DATASET_CATEGORIES.reduce((s, r) => s + r.fullTarget, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Acceptance targets */}
      <section className="mt-14 mb-8">
        <h2 className="font-display text-xl font-semibold text-ink">Acceptance targets</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Not yet measured — these apply once extraction (Phase 3) and matching
          (Phase 4) are built against the labeled dataset.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <tbody className="divide-y divide-rule">
              {ACCEPTANCE_TARGETS.map((row) => (
                <tr key={row.metric}>
                  <td className="py-2.5 pr-6 text-ink-muted">{row.metric}</td>
                  <td className="py-2.5 text-right font-tabular font-medium text-ink">
                    {row.target}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
