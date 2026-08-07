import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildAuthorizeUrl } from "@/lib/accounting/qbo-client";

// Admin-only entry point into the QuickBooks OAuth flow — never linked from
// any public page. Gated by ADMIN_SETUP_TOKEN (a shared secret, not a user
// session — there is no user auth system in this portfolio demo). The state
// cookie set here is what actually secures the callback: it's httpOnly, so
// only this server can read or forge it, and it's scoped under
// /api/accounting/qbo so it's sent back on the callback request but nowhere
// else.
const STATE_COOKIE = "qbo_oauth_state";

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false; // different lengths would otherwise throw
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  const adminToken = process.env.ADMIN_SETUP_TOKEN;
  if (!adminToken) {
    return NextResponse.json({ error: "admin_setup_token_not_configured" }, { status: 500 });
  }

  const providedToken = request.nextUrl.searchParams.get("token") ?? "";
  if (!timingSafeEqual(providedToken, adminToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const state = crypto.randomBytes(24).toString("hex");
  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes is generous for a flow that should take under one
    path: "/api/accounting/qbo",
  });
  return response;
}
