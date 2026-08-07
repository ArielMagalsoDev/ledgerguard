import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForConnection } from "@/lib/accounting/qbo-client";
import { supabaseAdmin } from "@/lib/supabase/server";

const STATE_COOKIE = "qbo_oauth_state";

// Intuit redirects the browser here directly — this request carries no
// admin token. The CSRF state cookie (set only by /connect, only reachable
// after the admin-token check there) is what proves this callback follows a
// connect request this server itself initiated.
export async function GET(request: NextRequest) {
  const deniedReason = request.nextUrl.searchParams.get("error");
  if (deniedReason) {
    return NextResponse.json({ error: "qbo_authorization_denied", detail: deniedReason }, { status: 400 });
  }

  const returnedState = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  if (!returnedState || !cookieState || returnedState !== cookieState) {
    const response = NextResponse.json(
      { error: "invalid_oauth_state", detail: "CSRF state mismatch or missing — restart the connect flow." },
      { status: 400 }
    );
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  try {
    const connection = await exchangeCodeForConnection(supabaseAdmin(), request.url);
    const response = NextResponse.json({
      connected: true,
      environment: connection.environment,
      realmId: connection.realm_id,
      accessTokenExpiresAt: connection.access_token_expires_at,
    });
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("[GET /api/accounting/qbo/callback]", err);
    const response = NextResponse.json(
      { error: "token_exchange_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
    response.cookies.delete(STATE_COOKIE);
    return response;
  }
}
