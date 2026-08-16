"""Policy config — tolerances and approval bands."""

from dataclasses import dataclass, field

from .config import POLICY_VERSION  # noqa: F401 — re-exported for callers that import it from here


@dataclass(frozen=True)
class Tolerance:
    pct: float
    flat: float


@dataclass(frozen=True)
class QuantityTolerance:
    requires_receipt_for_excess: bool


@dataclass(frozen=True)
class ApprovalTier:
    up_to_usd: float | None
    role: str


@dataclass(frozen=True)
class PolicyConfig:
    unit_price_tolerance: Tolerance
    quantity_tolerance: QuantityTolerance
    total_invoice_tolerance: Tolerance
    tax_rounding_tolerance_usd: float
    approval_thresholds: list[ApprovalTier] = field(default_factory=list)


DEFAULT_POLICY = PolicyConfig(
    unit_price_tolerance=Tolerance(pct=0.02, flat=25),
    quantity_tolerance=QuantityTolerance(requires_receipt_for_excess=True),
    total_invoice_tolerance=Tolerance(pct=0.01, flat=50),
    tax_rounding_tolerance_usd=0.02,
    approval_thresholds=[
        ApprovalTier(up_to_usd=1000, role="property_manager"),
        ApprovalTier(up_to_usd=5000, role="regional_operations_manager"),
        ApprovalTier(up_to_usd=25000, role="finance_manager"),
        ApprovalTier(up_to_usd=None, role="controller"),
    ],
)


def policy_config_to_dict(policy: PolicyConfig) -> dict:
    return {
        "unitPriceTolerance": {"pct": policy.unit_price_tolerance.pct, "flat": policy.unit_price_tolerance.flat},
        "quantityTolerance": {"requiresReceiptForExcess": policy.quantity_tolerance.requires_receipt_for_excess},
        "totalInvoiceTolerance": {
            "pct": policy.total_invoice_tolerance.pct,
            "flat": policy.total_invoice_tolerance.flat,
        },
        "taxRoundingToleranceUsd": policy.tax_rounding_tolerance_usd,
        "approvalThresholds": [{"upToUsd": t.up_to_usd, "role": t.role} for t in policy.approval_thresholds],
    }


def parse_policy_config(raw: dict | None) -> PolicyConfig:
    """Merges a stored `policies.config` row over the fallback default — never
    trusts a partial/malformed row blindly."""
    if not raw:
        return DEFAULT_POLICY
    try:
        upt = raw.get("unitPriceTolerance") or {}
        qt = raw.get("quantityTolerance") or {}
        tit = raw.get("totalInvoiceTolerance") or {}
        thresholds = raw.get("approvalThresholds")
        return PolicyConfig(
            unit_price_tolerance=Tolerance(
                pct=upt.get("pct", DEFAULT_POLICY.unit_price_tolerance.pct),
                flat=upt.get("flat", DEFAULT_POLICY.unit_price_tolerance.flat),
            ),
            quantity_tolerance=QuantityTolerance(
                requires_receipt_for_excess=qt.get(
                    "requiresReceiptForExcess", DEFAULT_POLICY.quantity_tolerance.requires_receipt_for_excess
                )
            ),
            total_invoice_tolerance=Tolerance(
                pct=tit.get("pct", DEFAULT_POLICY.total_invoice_tolerance.pct),
                flat=tit.get("flat", DEFAULT_POLICY.total_invoice_tolerance.flat),
            ),
            tax_rounding_tolerance_usd=raw.get(
                "taxRoundingToleranceUsd", DEFAULT_POLICY.tax_rounding_tolerance_usd
            ),
            approval_thresholds=[ApprovalTier(up_to_usd=t.get("upToUsd"), role=t["role"]) for t in thresholds]
            if thresholds
            else DEFAULT_POLICY.approval_thresholds,
        )
    except (KeyError, TypeError, AttributeError):
        return DEFAULT_POLICY


def approver_role_for_amount(policy: PolicyConfig, amount_usd: float) -> str:
    """The approval-threshold band a dollar amount falls into."""
    for tier in policy.approval_thresholds:
        if tier.up_to_usd is None or amount_usd <= tier.up_to_usd:
            return tier.role
    return policy.approval_thresholds[-1].role if policy.approval_thresholds else "controller"
