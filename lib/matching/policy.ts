export type PolicyConfig = {
  unitPriceTolerance: { pct: number; flat: number };
  quantityTolerance: { requiresReceiptForExcess: boolean };
  totalInvoiceTolerance: { pct: number; flat: number };
  taxRoundingToleranceUsd: number;
  approvalThresholds: Array<{ upToUsd: number | null; role: string }>;
};

const DEFAULT_POLICY: PolicyConfig = {
  unitPriceTolerance: { pct: 0.02, flat: 25 },
  quantityTolerance: { requiresReceiptForExcess: true },
  totalInvoiceTolerance: { pct: 0.01, flat: 50 },
  taxRoundingToleranceUsd: 0.02,
  approvalThresholds: [
    { upToUsd: 1000, role: "property_manager" },
    { upToUsd: 5000, role: "regional_operations_manager" },
    { upToUsd: 25000, role: "finance_manager" },
    { upToUsd: null, role: "controller" },
  ],
};

/** Merges the live `policies.config` row over the fallback default — never trusts a partial/malformed row blindly. */
export function parsePolicyConfig(raw: unknown): PolicyConfig {
  const c = (raw ?? {}) as Partial<PolicyConfig>;
  return {
    unitPriceTolerance: c.unitPriceTolerance ?? DEFAULT_POLICY.unitPriceTolerance,
    quantityTolerance: c.quantityTolerance ?? DEFAULT_POLICY.quantityTolerance,
    totalInvoiceTolerance: c.totalInvoiceTolerance ?? DEFAULT_POLICY.totalInvoiceTolerance,
    taxRoundingToleranceUsd: c.taxRoundingToleranceUsd ?? DEFAULT_POLICY.taxRoundingToleranceUsd,
    approvalThresholds: c.approvalThresholds ?? DEFAULT_POLICY.approvalThresholds,
  };
}

/** The approval-threshold band a dollar amount falls into — CLAUDE.md section 3. */
export function approverRoleForAmount(config: PolicyConfig, amountUsd: number): string {
  for (const tier of config.approvalThresholds) {
    if (tier.upToUsd === null || amountUsd <= tier.upToUsd) return tier.role;
  }
  return config.approvalThresholds[config.approvalThresholds.length - 1]?.role ?? "controller";
}
