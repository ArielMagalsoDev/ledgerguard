import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import type { ControlResult, ControlStatus } from "@/lib/types";

const STATUS_META: Record<
  ControlStatus,
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  passed: { icon: CheckCircle2, color: "var(--ready)", label: "Passed" },
  failed: { icon: XCircle, color: "var(--blocked)", label: "Failed" },
  warning: { icon: AlertTriangle, color: "var(--exception)", label: "Warning" },
  not_applicable: { icon: MinusCircle, color: "var(--ink-faint)", label: "N/A" },
};

export function ControlChecklist({ controls }: { controls: ControlResult[] }) {
  return (
    <ul className="divide-y divide-rule">
      {controls.map((control) => {
        const meta = STATUS_META[control.status];
        const Icon = meta.icon;
        return (
          <li key={control.controlId} className="flex gap-3 py-3">
            <Icon
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: meta.color }}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-ink">{control.label}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
                >
                  {meta.label}
                </span>
                {control.blocking && control.status === "failed" && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-blocked">
                    Blocks auto-approval
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                {control.reason}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
