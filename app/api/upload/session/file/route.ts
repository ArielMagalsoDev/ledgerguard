import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SESSION_COOKIE } from "@/lib/upload/session";

const STORAGE_BUCKET = "invoice-documents";

/**
 * Streams the visitor's own uploaded PDF back to their browser for the
 * result-view preview — the storage bucket is private, so this is the only
 * way to render it, and it re-checks session ownership on every request
 * rather than ever handing out a signed URL a visitor could pass around.
 */
export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const invoiceId = request.nextUrl.searchParams.get("invoiceId");
  if (!sessionToken || !invoiceId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: invoice } = await db
    .from("invoices")
    .select("storage_path, expires_at")
    .eq("id", invoiceId)
    .eq("source", "upload")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (!invoice || !invoice.storage_path) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (invoice.expires_at && new Date(invoice.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const { data: blob, error } = await db.storage.from(STORAGE_BUCKET).download(invoice.storage_path);
  if (error || !blob) {
    return NextResponse.json({ error: "file_unavailable" }, { status: 404 });
  }

  const bytes = await blob.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "inline",
      "cache-control": "private, no-store",
    },
  });
}
