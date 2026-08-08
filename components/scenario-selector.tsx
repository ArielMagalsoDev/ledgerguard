import type { DemoScenario } from "@/lib/types";
import { OUTCOME_META } from "@/lib/outcome";

export function ScenarioSelector({
  scenarios,
  activeId,
  onSelect,
}: {
  scenarios: DemoScenario[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid min-w-0 grid-flow-col auto-cols-[minmax(10.5rem,1fr)] gap-3 overflow-x-auto pb-2 md:grid-flow-row md:auto-cols-auto md:grid-cols-5 md:overflow-visible md:pb-0">
      {scenarios.map((scenario) => {
        const meta = OUTCOME_META[scenario.outcome];
        const active = scenario.id === activeId;
        return (
          <button
            key={scenario.id}
            type="button"
            onClick={() => onSelect(scenario.id)}
            aria-pressed={active}
            className={[
              "group relative flex min-h-48 min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border p-4 text-left transition-all",
              active
                ? "border-accent bg-paper-raised shadow-[inset_0_0_0_1px_var(--accent)]"
                : "border-rule bg-paper-raised hover:-translate-y-0.5 hover:border-rule-strong",
            ].join(" ")}
          >
            {active && <span className="absolute inset-x-0 top-0 h-1.5 bg-accent" aria-hidden />}
            <div className="flex items-start justify-between gap-3">
              <span className={`font-tabular text-4xl font-medium leading-none tracking-tight ${active ? "text-accent" : "text-rule-strong"}`}>
                0{scenario.order}
              </span>
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
            </div>
            <div className="mt-7 text-base font-semibold leading-tight text-ink">
              {scenario.shortLabel}
            </div>
            <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-muted">
              {scenario.tagline}
            </div>
            <div className="mt-auto flex items-end justify-between gap-3 pt-5">
              <span className="font-tabular text-[10px] font-medium uppercase tracking-wide" style={{ color: meta.color }}>
                {meta.short}
              </span>
              <span className="text-xl leading-none text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden>→</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
