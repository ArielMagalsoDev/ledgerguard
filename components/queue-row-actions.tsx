"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatRoute } from "@/lib/route-labels";
import type { QueueItem } from "@/lib/queue/queue-items";

const ROLE_OPTIONS = [
  { value: "property_manager", label: "Property manager" },
  { value: "regional_operations_manager", label: "Regional ops manager" },
  { value: "finance_manager", label: "Finance manager" },
  { value: "controller", label: "Controller" },
  { value: "ap_review_team", label: "AP review team" },
] as const;

type Action = "approved" | "rejected" | "reassigned" | "commented";

/**
 * Phase 6 inline review actions. No real auth system exists in this
 * portfolio demo — name/role are self-declared — but every request still
 * goes through POST /api/invoices/[id]/actions's real server-side
 * re-checks (role-vs-approval_route, duplicate_hold can't be approved,
 * blocked requires a verification note, already-resolved is final). A
 * rejected request surfaces here, not silently swallowed.
 */
export function QueueRowActions({ item }: { item: QueueItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<string>(item.approvalRoute[0] ?? "ap_review_team");
  const [reassignTo, setReassignTo] = useState<string>("ap_review_team");
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (item.latestResolution) {
    const r = item.latestResolution;
    return (
      <div className="text-xs text-ink-muted">
        <span className="font-medium capitalize text-ink">{r.action}</span> by {r.actorName} ({formatRoute(r.actorRole)})
        {r.action === "reassigned" && r.reassignedTo && <span> → {formatRoute(r.reassignedTo)}</span>}
        {r.comment && <div className="mt-0.5 italic">&ldquo;{r.comment}&rdquo;</div>}
      </div>
    );
  }

  function submit(action: Action) {
    setError(null);
    if (!name.trim()) {
      setError("Your name is required.");
      return;
    }
    if ((action === "rejected" || action === "commented") && !comment.trim()) {
      setError(`A comment is required to ${action === "rejected" ? "reject" : "comment"}.`);
      return;
    }

    const body: Record<string, unknown> = { action, actorRole: role, actorName: name.trim() };
    if (comment.trim()) body.comment = comment.trim();
    if (action === "reassigned") body.reassignedTo = reassignTo;

    startTransition(async () => {
      const res = await fetch(`/api/invoices/${item.invoiceId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data.detail as string) ?? (data.error as string) ?? "Action failed.");
        return;
      }
      setComment("");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-xs space-y-1.5">
      <div className="flex gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-24 min-w-0 rounded border border-rule bg-paper px-1.5 py-1 text-xs text-ink placeholder:text-ink-faint"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="min-w-0 flex-1 rounded border border-rule bg-paper px-1.5 py-1 text-xs text-ink"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={item.outcome === "blocked" ? "Verification note (required to approve)" : "Comment (optional unless rejecting)"}
        rows={2}
        className="w-full resize-none rounded border border-rule bg-paper px-1.5 py-1 text-xs text-ink placeholder:text-ink-faint"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("approved")}
          className="rounded bg-[var(--ready-bg)] px-2 py-1 text-[11px] font-medium text-ready hover:opacity-80 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("rejected")}
          className="rounded bg-[var(--blocked-bg)] px-2 py-1 text-[11px] font-medium text-blocked hover:opacity-80 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("commented")}
          className="rounded border border-rule px-2 py-1 text-[11px] font-medium text-ink-muted hover:bg-paper-raised disabled:opacity-50"
        >
          Comment
        </button>
        <select
          value={reassignTo}
          onChange={(e) => setReassignTo(e.target.value)}
          className="rounded border border-rule bg-paper px-1 py-1 text-[11px] text-ink"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              → {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("reassigned")}
          className="rounded border border-rule px-2 py-1 text-[11px] font-medium text-ink-muted hover:bg-paper-raised disabled:opacity-50"
        >
          Reassign
        </button>
      </div>
      {error && <p className="text-[11px] text-blocked">{error}</p>}
    </div>
  );
}
