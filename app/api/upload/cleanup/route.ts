import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sweepExpiredUploads } from "@/lib/upload/session";

// Daily cron backstop for upload deletion (ledgerguard.md "Critical
// correction 3: deletion mechanics on Vercel" — Hobby-tier crons are
// once-per-day, so the real deletion guarantee is layered: access-time
// expiry enforcement in the session route, an opportunistic sweep on every
// upload-flow request, and this as the backstop that catches anything
// traffic didn't). Gated by CRON_SECRET so it can't be triggered publicly —
// Vercel's own cron invoker sends this as a bearer token automatically for
// routes wired into vercel.json's `crons`.
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  let totalDeleted = 0;
  // Sweep in bounded batches rather than one unbounded pass — keeps each
  // iteration's storage calls small and predictable even if a burst of
  // sessions expired at once.
  for (let i = 0; i < 20; i++) {
    const deleted = await sweepExpiredUploads(db, 25);
    totalDeleted += deleted;
    if (deleted === 0) break;
  }

  return NextResponse.json({ deleted: totalDeleted });
}
