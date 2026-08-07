import type { ControlResult, ExtractedInvoice } from "@/lib/types";

// Deterministic pattern check for instruction-shaped content in untrusted
// free text — CLAUDE.md's instruction-screening control (Phase 4, scenario 5's
// defense). This is a visibility flag only: it never blocks, never changes
// any other control's result, and never touches supplier or decision data.
// The actual defense is structural (remittance comes only from the
// remittance field, approval only from deterministic control results) —
// this control just makes an attempt visible in the audit trail.
const INSTRUCTION_PATTERNS: RegExp[] = [
  /system\s+notice/i,
  /pre-?approved/i,
  /skip[\w\s]*(matching|verification|review)/i,
  /mark\s+(this\s+)?invoice\s+(as\s+)?ready/i,
  /update\s+(the\s+)?remittance/i,
  /ignore\s+(the\s+)?(previous|prior|all)\s+instructions?/i,
  /disregard\s+(the\s+)?(previous|prior)/i,
  /do\s+not\s+(verify|check|review)/i,
  /automatically\s+approve/i,
];

export function screenInstructions(extracted: ExtractedInvoice): ControlResult {
  const notes = extracted.notes;

  if (!notes || notes.value == null || notes.status === "missing") {
    return {
      controlId: "source_screening",
      label: "Embedded-instruction screening",
      status: "passed",
      severity: "low",
      reason: "No instruction-shaped content detected in extracted text fields.",
      evidenceReferences: [],
      blocking: false,
    };
  }

  const text = notes.value;
  const matched = INSTRUCTION_PATTERNS.find((p) => p.test(text));

  if (matched) {
    const snippet = text.length > 120 ? `${text.slice(0, 120)}...` : text;
    return {
      controlId: "source_screening",
      label: "Embedded-instruction screening",
      status: "warning",
      severity: "high",
      reason: `Instruction-shaped content detected in the invoice notes ("${snippet}"). Treated as untrusted text — ignored by every downstream control and never used to change a decision, a status, or supplier data.`,
      evidenceReferences: ["notes"],
      blocking: false,
    };
  }

  return {
    controlId: "source_screening",
    label: "Embedded-instruction screening",
    status: "passed",
    severity: "low",
    reason: "No instruction-shaped content detected in extracted text fields.",
    evidenceReferences: [],
    blocking: false,
  };
}
