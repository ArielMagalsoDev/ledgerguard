import type { DecisionOutcome } from "@/lib/types";
import { approverRoleForAmount, type PolicyConfig } from "@/lib/matching/policy";

/**
 * CLAUDE.md section 3: an exception never routes to a cheaper approver than
 * a clean invoice of the same amount would get — it routes to that same
 * band PLUS AP. Duplicate holds get no approval task at all. Blocked
 * invoices bypass the amount bands entirely — bank-detail and identity
 * failures escalate straight to AP + Controller regardless of amount.
 */
export function computeApprovalRoute(outcome: DecisionOutcome, totalUsd: number, policy: PolicyConfig): string[] {
  switch (outcome) {
    case "ready_for_approval":
      return [approverRoleForAmount(policy, totalUsd)];
    case "exception_review":
      return [approverRoleForAmount(policy, totalUsd), "ap_review_team"];
    case "duplicate_hold":
      return [];
    case "blocked":
      return ["ap_review_team", "controller"];
  }
}

const COST_CENTER_RULES: Array<{ keywords: RegExp; costCenter: string; accountCode: string }> = [
  { keywords: /clean|janitor|pest/i, costCenter: "CC-FAC-CLEAN", accountCode: "6120-SUPPLIES" },
  { keywords: /hvac|mechanical|compressor|refrigerant/i, costCenter: "CC-FAC-MECH", accountCode: "6130-MAINTENANCE" },
  { keywords: /security|patrol|guard/i, costCenter: "CC-FAC-SEC", accountCode: "6140-SECURITY" },
  { keywords: /ground|landscap|mow|mulch|irrigation/i, costCenter: "CC-FAC-GRND", accountCode: "6150-GROUNDS" },
];

/**
 * Lightweight keyword heuristic — there's no supplier→cost-center mapping in
 * the schema yet, so this infers from supplier name and line descriptions.
 * A known Phase 4 simplification; real cost-center assignment is Phase 5
 * territory once the accounting integration exists to validate against.
 */
export function guessCostCenter(supplierName: string, lineDescriptions: string[]): { costCenter: string; accountCode: string } {
  const haystack = [supplierName, ...lineDescriptions].join(" ");
  const rule = COST_CENTER_RULES.find((r) => r.keywords.test(haystack));
  return rule ? { costCenter: rule.costCenter, accountCode: rule.accountCode } : { costCenter: "CC-FAC-CLEAN", accountCode: "6120-SUPPLIES" };
}
