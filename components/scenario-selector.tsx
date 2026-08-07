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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
      {scenarios.map((scenario) => {
        const meta = OUTCOME_META[scenario.outcome];
        const active = scenario.id === activeId;
        return (
          <button
            key={scenario.id}
            type="button"
            onClick={() => onSelect(scenario.id)}
            className={[
              "rounded border px-3 py-2.5 text-left transition-colors",
              active
                ? "border-ink bg-paper-raised shadow-sm"
                : "border-rule bg-paper hover:border-rule-strong hover:bg-paper-raised/60",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <span className="font-tabular text-[10px] text-ink-faint">
                Scenario {scenario.order}
              </span>
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
            </div>
            <div className="mt-0.5 text-sm font-medium text-ink">
              {scenario.shortLabel}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-ink-faint">
              {scenario.tagline}
            </div>
          </button>
        );
      })}
    </div>
  );
}
