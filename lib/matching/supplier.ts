import { supabaseAdmin } from "@/lib/supabase/server";
import type { ControlResult, ExtractedInvoice, MatchTier } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"];

export type SupplierMatchResult = {
  supplierId: string | null;
  supplier: SupplierRow | null;
  tier: MatchTier;
  control: ControlResult;
};

/**
 * Tax ID first, always. Name is a candidate signal only — CLAUDE.md
 * section 12: "even a perfect name-similarity score never auto-promotes
 * past probable" (the same conservative posture SignalDesk's identity
 * resolution uses). New suppliers are never created here.
 */
export async function resolveSupplier(
  db: ReturnType<typeof supabaseAdmin>,
  extracted: ExtractedInvoice
): Promise<SupplierMatchResult> {
  const taxIdField = extracted.supplierTaxId;

  if (taxIdField.status === "verified" && taxIdField.normalizedValue) {
    const { data: exact } = await db
      .from("suppliers")
      .select("*")
      .eq("tax_id_normalized", taxIdField.normalizedValue)
      .maybeSingle();

    if (exact) {
      return {
        supplierId: exact.id,
        supplier: exact,
        tier: "exact",
        control: {
          controlId: "supplier_identity",
          label: "Supplier identity match",
          status: exact.status === "approved" ? "passed" : "failed",
          severity: exact.status === "approved" ? "low" : "critical",
          reason:
            exact.status === "approved"
              ? `Tax ID ${taxIdField.value} matches the approved ${exact.name} record exactly.`
              : `Tax ID ${taxIdField.value} matches ${exact.name}, but that supplier's status is "${exact.status}", not approved.`,
          evidenceReferences: ["supplierTaxId"],
          blocking: true,
        },
      };
    }
  }

  // No exact tax-ID match — fall back to normalized name as a candidate
  // signal only. Multiple candidates, or a name-only hit, never resolve
  // past "probable"/"ambiguous" — this function alone never confirms identity.
  const nameField = extracted.supplierName;
  if (nameField.status === "verified" && nameField.value) {
    const { data: candidates } = await db
      .from("suppliers")
      .select("id, name")
      .ilike("name", `%${nameField.value.trim()}%`);

    if (candidates && candidates.length === 1) {
      return {
        supplierId: null,
        supplier: null,
        tier: "probable",
        control: {
          controlId: "supplier_identity",
          label: "Supplier identity match",
          status: "warning",
          severity: "high",
          reason: `Tax ID did not match any approved supplier. Supplier name resembles "${candidates[0].name}" on file, but a name match alone is never treated as confirmed identity — requires human confirmation.`,
          evidenceReferences: ["supplierName"],
          blocking: true,
        },
      };
    }

    if (candidates && candidates.length > 1) {
      return {
        supplierId: null,
        supplier: null,
        tier: "ambiguous",
        control: {
          controlId: "supplier_identity",
          label: "Supplier identity match",
          status: "failed",
          severity: "high",
          reason: `Supplier name matches ${candidates.length} approved suppliers by name alone, with no tax-ID match to disambiguate. Requires human review before any automatic routing.`,
          evidenceReferences: ["supplierName"],
          blocking: true,
        },
      };
    }
  }

  return {
    supplierId: null,
    supplier: null,
    tier: "none",
    control: {
      controlId: "supplier_identity",
      label: "Supplier identity match",
      status: "failed",
      severity: "critical",
      reason: "No approved supplier matches this invoice's tax ID or name. New suppliers are never created automatically.",
      evidenceReferences: ["supplierTaxId", "supplierName"],
      blocking: true,
    },
  };
}
