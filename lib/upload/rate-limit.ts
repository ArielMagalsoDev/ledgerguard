// Rate limiting for the public upload endpoint, over the `rate_limit_events`
// table that existed in the schema since Phase 2 but had no code using it
// until now (CLAUDE.md section 18 lists this as ported-but-owed). Backed by
// the check_rate_limit RPC (upload_sandbox_schema migration) — count-then-
// insert, race-safe-enough for a demo-scale limiter, not a financial
// control like reserve_spend.
import { supabaseAdmin } from "@/lib/supabase/server";

const WINDOW_SECONDS = 60 * 60; // 1 hour
// RATE_LIMIT_PER_HOUR already existed in .env.example (reuse-stack config,
// CLAUDE.md section 18) but no code read it until this endpoint.
function maxPerWindow(): number {
  return Number(process.env.RATE_LIMIT_PER_HOUR ?? "5");
}

export type RateLimitResult = { allowed: boolean; countInWindow: number };

/**
 * `clientKey` should be a per-IP (or IP+session) identifier — never derived
 * from anything a client could spoof to reset their own budget for free.
 */
export async function checkRateLimit(clientKey: string): Promise<RateLimitResult> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("check_rate_limit", {
    p_client_key: clientKey,
    p_window_seconds: WINDOW_SECONDS,
    p_max: maxPerWindow(),
  });

  if (error) {
    // Fail closed on a broken rate limiter — a public spend-triggering
    // endpoint should never treat "I couldn't check the limit" as "unlimited".
    throw new Error(`checkRateLimit: RPC failed — ${error.message}`);
  }

  const row = data?.[0];
  return { allowed: row?.allowed ?? false, countInWindow: row?.count_in_window ?? maxPerWindow() };
}

/**
 * Best-effort client identifier from standard proxy headers (Vercel sets
 * x-forwarded-for). Never trust this for anything beyond rate limiting —
 * it's spoofable by a direct non-proxied client, which is an accepted
 * limitation for a demo-scale limiter backed by a real daily spend cap
 * underneath it (reserve_spend) as the actual financial backstop.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim();
  return ip || "unknown";
}
