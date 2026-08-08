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
import { PageHero } from "@/components/page-hero";
import { RecruiterProof } from "@/components/recruiter-proof";

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
  const liveScenarioCount = scenarios.filter((item) => item.isLive).length;

  function handleSelectScenario(id: string) {
    setActiveId(id);
    setSelectedText(null);
  }

  return (
    <div>
      <PageHero
        eyebrow="Interactive product proof"
        title={<>One invoice. Every <span className="text-accent">field, rule, and decision</span> visible.</>}
        description={<>Choose a scenario and inspect document evidence, deterministic controls, approval routing, latency, model cost, and audit history. Click any extracted field to trace it back to the source.</>}
        aside={
          <div className="font-tabular text-xs text-ink-faint">
            <strong className="block font-display text-3xl font-normal text-ready">{liveScenarioCount}/{scenarios.length}</strong>
            live scenario results
            <span className="mt-2 block">policy_2026.3 · fictional data</span>
          </div>
        }
        actions={
          <>
            <Link href="/architecture" className="btn-pill btn-pill-primary">How the controls work</Link>
            <Link href="/evals" className="btn-pill btn-pill-outline">View evaluations</Link>
          </>
        }
      />

      <div className="mx-auto max-w-6xl px-5 pb-4 pt-8 sm:px-8">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-marker">(Choose a controlled scenario)</p>
            <h2 className="mt-2 font-display text-2xl font-normal text-ink">AP workbench</h2>
          </div>
          <p className="max-w-lg text-xs leading-relaxed text-ink-faint sm:text-right">All suppliers, invoices, purchase orders, receipts, and amounts are fictional.</p>
        </div>

      <div>
        <ScenarioSelector
          scenarios={SCENARIOS}
          activeId={activeId}
          onSelect={handleSelectScenario}
        />
        {uploadSandboxEnabled && (
          <Link
            href="/try"
            className="mt-3 flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-dashed border-rule-strong bg-paper-raised px-5 py-4 text-sm font-medium text-ink transition-colors hover:border-accent"
          >
            <span>Have an invoice of your own?</span>
            <span className="flex items-center gap-2">
              Upload and test it
              <UploadCloud className="h-4 w-4" aria-hidden />
            </span>
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-rule bg-paper-raised px-5 py-4">
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

      <RecruiterProof
        title="This demo exposes the implementation, not just the happy path."
        description="Five scenarios demonstrate extraction provenance, arithmetic checks, matching, duplicate identity, bank-detail holds, prompt-injection handling, idempotency, and auditability."
      />
    </div>
  );
}
