import { Bot, Cpu } from "lucide-react";
import type { AuditEvent } from "@/lib/types";

const ACTOR_META = {
  system: { icon: Cpu, label: "Deterministic code" },
  ai_model: { icon: Bot, label: "AI model" },
  human: { icon: Cpu, label: "Human" },
} as const;

function formatTime(iso: string): string {
  return iso.slice(11, 19) + " UTC";
}

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  const totalLatencyMs = events.reduce((sum, e) => sum + (e.latencyMs ?? 0), 0);
  const totalCostUsd = events.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);

  return (
    <div className="card-paper p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-rule-strong pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Audit history
        </span>
        <span className="font-tabular text-xs text-ink-muted">
          {(totalLatencyMs / 1000).toFixed(1)}s total · ${totalCostUsd.toFixed(4)} total
        </span>
      </div>
      <ol className="relative space-y-0 border-l border-rule pl-4">
        {events.map((event) => {
          const actorMeta = ACTOR_META[event.actor];
          const ActorIcon = actorMeta.icon;
          return (
            <li key={event.id} className="relative py-2.5">
              <span className="absolute -left-[21px] top-3.5 h-2 w-2 rounded-full border-2 border-paper-raised bg-ink-faint" />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <div className="flex items-center gap-1.5">
                  <ActorIcon className="h-3 w-3 text-ink-faint" aria-hidden />
                  <span className="text-sm font-medium text-ink">{event.label}</span>
                </div>
                <span className="font-tabular text-[11px] text-ink-faint">
                  {formatTime(event.timestamp)}
                </span>
              </div>
              <p className="mt-0.5 pr-2 text-xs leading-relaxed text-ink-muted">
                {event.detail}
              </p>
              {(event.latencyMs !== undefined || event.costUsd !== undefined) && (
                <p className="mt-0.5 font-tabular text-[11px] text-ink-faint">
                  {event.latencyMs !== undefined && `${event.latencyMs}ms`}
                  {event.latencyMs !== undefined && event.costUsd !== undefined && " · "}
                  {event.costUsd !== undefined && `$${event.costUsd.toFixed(4)}`}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
