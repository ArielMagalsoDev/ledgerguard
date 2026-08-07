"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Radio, UploadCloud } from "lucide-react";
import type { DemoScenario } from "@/lib/types";
import { OutcomeBadge } from "@/components/outcome-badge";
import { ScenarioSelector } from "@/components/scenario-selector";
import { InvoiceDocument } from "@/components/invoice-document";
import { ExtractedDataPanel } from "@/components/extracted-data-panel";
import { MatchEvidencePanel } from "@/components/match-evidence-panel";
import { ControlChecklist } from "@/components/control-checklist";
import { ProposedActionPanel } from "@/components/proposed-action-panel";
import { AuditTrail } from "@/components/audit-trail";

export function Workbench({
  scenarios,
  initialScenarioId,
  uploadSandboxEnabled = false,
}: {
  scenarios: Array<{ scenario: DemoScenario; isLive: boolean }>;
  initialScenarioId?: string;
  uploadSandboxEnabled?: boolean;
}) {
  const SCENARIOS = scenarios.map((s) => s.scenario);
  const liveById = new Map(scenarios.map((s) => [s.scenario.id, s.isLive]));

  const initial =
    (initialScenarioId && SCENARIOS.find((s) => s.id === initialScenarioId)?.id) ??
    SCENARIOS[0].id;
  const [activeId, setActiveId] = useState(initial);
  const [selectedText, setSelectedText] = useState<string | null>(null);

  const scenario = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0];
  const isLive = liveById.get(scenario.id) ?? false;
  const flaggedLineIds = scenario.documentLines
    .filter((l) => l.kind === "notes" && scenario.extracted.notes)
    .map((l) => l.id);
  const isInjectionScenario = scenario.id === "prompt-injection";

  function handleSelectScenario(id: string) {
    setActiveId(id);
    setSelectedText(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-8 sm:px-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
          AP workbench
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Pick a scenario. Every field below is either read off the document
          or computed by deterministic code — click a field to see where it
          came from.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ScenarioSelector
          scenarios={SCENARIOS}
          activeId={activeId}
          onSelect={handleSelectScenario}
        />
        {uploadSandboxEnabled && (
          <Link
            href="/try"
            className="btn-pill btn-pill-outline shrink-0 items-center gap-1.5 self-start"
          >
            <UploadCloud className="h-3.5 w-3.5" aria-hidden />
            Try your own invoice
          </Link>
        )}
      </div>

      {isInjectionScenario && (
        <div className="mt-4 flex items-start gap-2.5 rounded border border-exception/40 bg-[var(--exception-bg)] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-exception" aria-hidden />
          <p className="text-sm text-ink">
            This invoice contains text written to manipulate an AI reader —
            look for the highlighted notes line in the document, and the
            flagged control at the bottom of the checklist.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-rule py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">
              {scenario.title}
            </h2>
            <OutcomeBadge outcome={scenario.outcome} />
            <span
              title={
                isLive
                  ? "Real Claude extraction + deterministic matching/control output from the database, tagged by npm run run-demo-pipeline."
                  : "No live pipeline run found for this scenario yet — showing the static fixture. Run `npm run run-demo-pipeline` to make this real."
              }
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                isLive ? "bg-[var(--ready-bg)] text-ready" : "bg-paper-raised text-ink-faint"
              }`}
            >
              <Radio className="h-2.5 w-2.5" aria-hidden />
              {isLive ? "Live" : "Fixture"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">{scenario.tagline}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 rounded border border-rule bg-paper-raised/50 p-4 sm:grid-cols-2 sm:p-5">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            What happened
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            {scenario.narrative.whatHappened}
          </p>
        </div>
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Why it matters
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            {scenario.narrative.whyItMatters}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InvoiceDocument
          lines={scenario.documentLines}
          highlightText={selectedText}
          flaggedLineIds={flaggedLineIds}
        />
        <ExtractedDataPanel
          extracted={scenario.extracted}
          selectedText={selectedText}
          onSelect={setSelectedText}
        />
        <MatchEvidencePanel scenario={scenario} />
        <div className="card-paper p-5 sm:p-6">
          <div className="mb-1 border-b border-rule-strong pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              Control results ({scenario.controls.length})
            </span>
          </div>
          <ControlChecklist controls={scenario.controls} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProposedActionPanel scenario={scenario} />
        <AuditTrail events={scenario.auditEvents} />
      </div>
    </div>
  );
}
