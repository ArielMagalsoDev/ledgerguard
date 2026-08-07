import { supabaseAdmin } from "@/lib/supabase/server";

export type ReceiptMatch = {
  receiptIds: string[];
  receivedQuantityByDescription: Map<string, number>;
};

function normalizeDescription(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Sums received quantity per line description across every receipt on file
 * for a PO. This is the evidence PO tolerance checks consult before allowing
 * a quantity over the PO-approved amount — CLAUDE.md section 12: "Quantity
 * tolerance: zero unless a receipt records the additional quantity."
 */
export async function matchReceipts(
  db: ReturnType<typeof supabaseAdmin>,
  purchaseOrderId: string
): Promise<ReceiptMatch> {
  const { data: receipts } = await db
    .from("receipts")
    .select("id, receipt_lines(description, quantity_received)")
    .eq("purchase_order_id", purchaseOrderId);

  const receivedQuantityByDescription = new Map<string, number>();
  const receiptIds: string[] = [];

  for (const receipt of receipts ?? []) {
    receiptIds.push(receipt.id);
    for (const line of receipt.receipt_lines ?? []) {
      const key = normalizeDescription(line.description);
      receivedQuantityByDescription.set(key, (receivedQuantityByDescription.get(key) ?? 0) + line.quantity_received);
    }
  }

  return { receiptIds, receivedQuantityByDescription };
}
