"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Trash2, UploadCloud } from "lucide-react";
import type { DemoScenario } from "@/lib/types";
import { OutcomeBadge } from "@/components/outcome-badge";
import { ExtractedDataPanel } from "@/components/extracted-data-panel";
import { MatchEvidencePanel } from "@/components/match-evidence-panel";
import { ControlChecklist } from "@/components/control-checklist";
import { ProposedActionPanel } from "@/components/proposed-action-panel";
import { AuditTrail } from "@/components/audit-trail";

// The real stages the pipeline runs, in order — same stage labels
// process-invoice-job.ts actually writes as audit_events. Shown while the
// one synchronous upload request is in flight so a visitor sees what's
// happening instead of a generic spinner; the real, timestamped record of
// what happened appears in the audit trail once the result loads.
const STAGES = [
  "Validating file",
  "Extracting document text",
  "Aligning evidence against the document",
  "Recalculating amounts",
  "Checking required controls",
  "Choosing a responsible outcome",
];

type Stage = "disclosure" | "ready" | "busy" | "result" | "error";

type ResultState = {
  scenario: DemoScenario;
  expiresAt: string;
  invoiceId: string;
};

function useCountdown(expiresAt: string | null) {
  const [msRemaining, setMsRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setMsRemaining(new Date(expiresAt).getTime() - Date.now());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return msRemaining;
}

export function UploadFlow() {
  const [stage, setStage] = useState<Stage>("disclosure");
  const [acknowledged, setAcknowledged] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msRemaining = useCountdown(result?.expiresAt ?? null);

  const pollForResult = useCallback(async (invoiceId: string, attemptsLeft: number) => {
    const res = await fetch(`/api/upload/session?invoiceId=${invoiceId}`);
    if (res.status === 200) {
      const data = await res.json();
      if (data.state === "ready") {
        setResult({ scenario: data.scenario, expiresAt: data.expiresAt, invoiceId });
        setStage("result");
        return;
      }
    }
    if (attemptsLeft <= 0) {
      setErrorMessage("Processing is taking longer than expected. Refresh this page in a moment, or try again.");
      setStage("error");
      return;
    }
    setTimeout(() => pollForResult(invoiceId, attemptsLeft - 1), 2000);
  }, []);

  async function handleSubmit() {
    if (!file) return;
    setStage("busy");
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201) {
        setResult({
          scenario: null as unknown as DemoScenario, // placeholder — full scenario fetched next
          expiresAt: "",
          invoiceId: data.invoiceId,
        });
        // Fetch the fully-assembled result view rather than trusting the
        // POST response alone — it only returns the bare outcome. A couple
        // of retries absorb any tiny read-after-write lag, even though the
        // decision already exists by the time POST returns 201.
        await pollForResult(data.invoiceId, 3);
        return;
      }
      if (res.status === 202) {
        await pollForResult(data.invoiceId, 14);
        return;
      }
      if (res.status === 422) {
        setErrorMessage(data.message ?? "This file couldn't be validated.");
        setStage("error");
        return;
      }
      if (res.status === 429) {
        setErrorMessage(data.message ?? "Too many uploads — try again later.");
        setStage("error");
        return;
      }
      setErrorMessage(data.message ?? "Something went wrong processing this upload.");
      setStage("error");
    } catch {
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
      setStage("error");
    }
  }

  async function handleDeleteNow() {
    if (!result) return;
    await fetch(`/api/upload/session?invoiceId=${result.invoiceId}`, { method: "DELETE" });
    setDeleteConfirmed(true);
  }

  function reset() {
    setFile(null);
    setResult(null);
    setErrorMessage(null);
    setDeleteConfirmed(false);
    setSelectedText(null);
    setStage("ready");
  }

  function handleFileChosen(chosen: File | null) {
    setErrorMessage(null);
    setFile(chosen);
  }

  // --- Disclosure gate ---
  if (stage === "disclosure") {
    return (
      <div className="card-paper max-w-2xl p-6 sm:p-8">
        <h2 className="font-display text-xl font-normal text-ink">Before you upload</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Your invoice can demonstrate extraction, evidence linking, arithmetic validation, and exception routing.
          <strong className="text-ink"> Digital PDFs only</strong> — scanned documents need OCR, which this demo
          doesn&rsquo;t run. Supplier and three-way matching require Ledger Guard&rsquo;s included fictional
          scenarios, so an uploaded invoice will normally resolve as an <strong className="text-ink">exception</strong> —
          that&rsquo;s the honest, expected result, not a failure. Files are temporary and{" "}
          <strong className="text-ink">deleted automatically within 30 minutes</strong>, or immediately if you ask.
          Don&rsquo;t upload confidential information or real banking details.
        </p>
        <ul className="mt-4 space-y-1.5 text-xs text-ink-muted">
          <li>· No account, no name, no email collected — a random session only.</li>
          <li>· This can never authorize a payment or write a real accounting record.</li>
          <li>· Up to 5 uploads per hour, per connection.</li>
        </ul>
        <label className="mt-5 flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          I understand this is a temporary sandbox and won&rsquo;t upload confidential or sensitive information.
        </label>
        <button
          type="button"
          disabled={!acknowledged}
          onClick={() => setStage("ready")}
          className="btn-pill btn-pill-primary mt-5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    );
  }

  // --- Result view ---
  if (stage === "result" && result?.scenario) {
    const { scenario, invoiceId } = result;
    const minutesLeft = msRemaining != null ? Math.max(0, Math.round(msRemaining / 60000)) : null;
    const isSupplierUnmatched = scenario.match.supplierMatch === "none";

    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-normal text-ink">{scenario.title}</h2>
            <OutcomeBadge outcome={scenario.outcome} />
          </div>
          <div className="flex items-center gap-3">
            {!deleteConfirmed && minutesLeft != null && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {minutesLeft > 0 ? `Deleted automatically in ${minutesLeft} min` : "Deleting shortly"}
              </span>
            )}
            {!deleteConfirmed ? (
              <button
                type="button"
                onClick={handleDeleteNow}
                className="btn-pill btn-pill-outline inline-flex items-center gap-1.5 !py-1.5 !px-3 text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete my uploaded document now
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-ready">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Deleted
              </span>
            )}
          </div>
        </div>

        {deleteConfirmed ? (
          <div className="mt-6 card-paper p-6 text-center">
            <p className="text-sm text-ink">Your document and every derived record have been deleted.</p>
            <button type="button" onClick={reset} className="btn-pill btn-pill-primary mt-4">
              Try another invoice
            </button>
          </div>
        ) : (
          <>
            {isSupplierUnmatched && (
              <div className="mt-4 flex items-start gap-2.5 rounded border border-exception/40 bg-[var(--exception-bg)] px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-exception" aria-hidden />
                <p className="text-sm text-ink">
                  This supplier isn&rsquo;t in Ledger Guard&rsquo;s fictional approved-supplier master — expected for
                  an uploaded document, since the demo only recognizes its own seeded suppliers. Supplier, PO, and
                  receipt matching are unavailable here; extraction, evidence alignment, and arithmetic still ran for
                  real. Uploads never auto-approve, regardless of how clean the rest of the checks come back.
                </p>
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="card-paper p-2">
                <iframe
                  src={`/api/upload/session/file?invoiceId=${invoiceId}`}
                  title="Your uploaded invoice"
                  className="h-[560px] w-full rounded"
                />
              </div>
              <ExtractedDataPanel extracted={scenario.extracted} selectedText={selectedText} onSelect={setSelectedText} />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <MatchEvidencePanel scenario={scenario} />
              <div className="card-paper p-5 sm:p-6">
                <div className="mb-3 border-b border-rule-strong pb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                    Controls
                  </span>
                </div>
                <ControlChecklist controls={scenario.controls} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ProposedActionPanel scenario={scenario} />
              <AuditTrail events={scenario.auditEvents} />
            </div>

            <div className="mt-6 flex justify-center">
              <button type="button" onClick={reset} className="btn-pill btn-pill-outline">
                Try another invoice
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // --- Busy (uploading + processing) ---
  if (stage === "busy") {
    return (
      <div className="card-paper max-w-xl p-6 text-center sm:p-8">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-rule-strong border-t-ink" />
        <p className="mt-4 text-sm text-ink">
          Processing — this can take up to 30 seconds. No outcome is guaranteed until every check finishes.
        </p>
        <ul className="mt-4 space-y-1.5 text-left text-xs text-ink-muted">
          {STAGES.map((label) => (
            <li key={label} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // --- Error ---
  if (stage === "error") {
    return (
      <div className="card-paper max-w-xl p-6 text-center sm:p-8">
        <AlertTriangle className="mx-auto h-6 w-6 text-exception" aria-hidden />
        <p className="mt-3 text-sm text-ink">{errorMessage}</p>
        <button type="button" onClick={reset} className="btn-pill btn-pill-primary mt-5">
          Try again
        </button>
      </div>
    );
  }

  // --- Ready: file picker ---
  return (
    <div className="max-w-xl">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) handleFileChosen(dropped);
        }}
        className={`card-paper flex flex-col items-center gap-3 border-dashed p-8 text-center transition-colors ${
          dragActive ? "border-ink bg-ink/5" : ""
        }`}
      >
        <UploadCloud className="h-8 w-8 text-ink-faint" aria-hidden />
        <p className="text-sm text-ink">Drag a PDF invoice here, or</p>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-pill btn-pill-outline">
          Choose a file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-ink-faint">Digital PDF, up to 5 MB, up to 4 pages.</p>
      </div>

      {file && (
        <div className="mt-4 flex items-center justify-between rounded border border-rule bg-paper-raised px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-ink">{file.name}</p>
            <p className="text-xs text-ink-faint">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button type="button" onClick={() => handleFileChosen(null)} className="text-xs text-ink-muted underline">
            Remove
          </button>
        </div>
      )}

      {errorMessage && <p className="mt-3 text-sm text-blocked">{errorMessage}</p>}

      <button
        type="button"
        disabled={!file}
        onClick={handleSubmit}
        className="btn-pill btn-pill-primary mt-5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Run it through Ledger Guard
      </button>
    </div>
  );
}
