export const ROUTE_LABELS: Record<string, string> = {
  ap_review_team: "AP review team",
  controller: "Controller",
  finance_manager: "Finance manager",
  regional_operations_manager: "Regional operations manager",
  property_manager: "Property manager",
};

export function formatRoute(role: string): string {
  const [key, detail] = role.split(":");
  const label = ROUTE_LABELS[key] ?? key.replace(/_/g, " ");
  return detail ? `${label} — ${detail}` : label;
}
