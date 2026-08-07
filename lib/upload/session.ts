// Upload sandbox — anonymous session cookie handling and deletion. The
// session token is a random UUID, never derived from the filename, email,
// or document contents (ledgerguard.md's data-boundaries requirement).
// Deletion mechanics follow the plan's three-layer approach: access-time
// expiry enforcement (checked by callers against `expires_at`), an
// opportunistic sweep called from every upload-flow API hit, and a daily
// cron backstop (app/api/upload/cleanup/route.ts) — see ledgerguard.md
// "Critical correction 3: deletion mechanics on Vercel".
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export const SESSION_COOKIE = "lg_upload_session";
export const SESSION_TTL_MINUTES = 30;
const STORAGE_BUCKET = "invoice-documents";

export function createSessionToken(): string {
  return randomUUID();
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // Slightly longer than the data TTL so a slow visitor doesn't lose the
    // cookie a moment before the row itself expires — the row's own
    // expires_at is the real, authoritative boundary either way.
    maxAge: (SESSION_TTL_MINUTES + 5) * 60,
  };
}

export function newExpiryTimestamp(): string {
  return new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();
}

/**
 * Deletes one upload invoice and everything derived from it: FK-safe order
 * (review_actions/accounting_bills use NO ACTION, not CASCADE — deleted
 * explicitly first even though no upload-sourced invoice should ever have
 * either, since upload mode structurally can't reach ready_for_approval or
 * the review queue) then the invoice row itself, which CASCADEs decisions/
 * controls/match_results/audit_events/jobs. Storage object deleted last so
 * a storage failure never leaves an orphaned-but-unreferenced DB row —
 * worst case is an orphaned storage object, which the deletion log below
 * surfaces for /operations to catch.
 */
export async function purgeUploadInvoice(
  db: ReturnType<typeof supabaseAdmin>,
  invoiceId: string,
  storagePath: string | null
): Promise<void> {
  await db.from("review_actions").delete().eq("invoice_id", invoiceId);
  await db.from("accounting_bills").delete().eq("invoice_id", invoiceId);
  await db.from("invoices").delete().eq("id", invoiceId);

  let storageDeleted = true;
  let note: string | null = null;
  if (storagePath) {
    const { error: storageError } = await db.storage.from(STORAGE_BUCKET).remove([storagePath]);
    if (storageError) {
      storageDeleted = false;
      note = `storage removal failed: ${storageError.message}`;
    }
  }

  await db.from("upload_deletions").insert({
    invoice_id: invoiceId,
    storage_path: storagePath,
    storage_deleted: storageDeleted,
    note,
  });
}

/**
 * Opportunistic sweep — called at the top of every upload-flow API request
 * so expired sessions get purged even without the daily cron ever running
 * (e.g. in a fresh preview deployment cron hasn't fired on yet). Bounded to
 * a small batch so it never turns a normal request into a slow one.
 */
export async function sweepExpiredUploads(db: ReturnType<typeof supabaseAdmin>, limit = 5): Promise<number> {
  const { data: expired } = await db
    .from("invoices")
    .select("id, storage_path")
    .eq("source", "upload")
    .lt("expires_at", new Date().toISOString())
    .limit(limit);

  for (const row of expired ?? []) {
    await purgeUploadInvoice(db, row.id, row.storage_path);
  }

  return expired?.length ?? 0;
}
