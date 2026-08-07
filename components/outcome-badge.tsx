import type { DecisionOutcome } from "@/lib/types";
import { OUTCOME_META } from "@/lib/outcome";

export function OutcomeBadge({
  outcome,
  size = "md",
}: {
  outcome: DecisionOutcome;
  size?: "sm" | "md" | "lg";
}) {
  const meta = OUTCOME_META[outcome];
  const sizeClasses =
    size === "lg"
      ? "px-4 py-1.5 text-sm"
      : size === "sm"
        ? "px-2 py-0.5 text-[11px]"
        : "px-3 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium uppercase tracking-wide ${sizeClasses}`}
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  );
}
