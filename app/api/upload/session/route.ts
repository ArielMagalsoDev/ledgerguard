import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getUploadScenario } from "@/lib/upload/upload-scenario";
import { purgeUploadInvoice, SESSION_COOKIE } from "@/lib/upload/session";

/**
 * GET ?invoiceId=... — session-scoped result lookup. Returns one of
 * not_found / expired / processing / ready; never another visitor's
 * upload, since every lookup is scoped to the session-cookie owner.
 */
export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const invoiceId = request.nextUrl.searchParams.get("invoiceId");

  if (!sessionToken || !invoiceId) {
    return NextResponse.json({ state: "not_found" }, { status: 404 });
  }

  const result = await getUploadScenario(invoiceId, sessionToken);
  const status = result.state === "not_found" ? 404 : result.state === "expired" ? 410 : 200;
  return NextResponse.json(result, { status });
}

/**
 * DELETE ?invoiceId=... — "Delete my uploaded document now." Without
 * invoiceId, purges every upload this session owns. Both paths verify
 * session ownership before deleting anything.
 */
export async function DELETE(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ deleted: 0 }, { status: 200 });
  }

  const db = supabaseAdmin();
  const invoiceId = request.nextUrl.searchParams.get("invoiceId");

  let query = db.from("invoices").select("id, storage_path").eq("source", "upload").eq("session_token", sessionToken);
  if (invoiceId) query = query.eq("id", invoiceId);
  const { data: rows } = await query;

  for (const row of rows ?? []) {
    await purgeUploadInvoice(db, row.id, row.storage_path);
  }

  return NextResponse.json({ deleted: rows?.length ?? 0 }, { status: 200 });
}
