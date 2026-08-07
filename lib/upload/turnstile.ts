// Cloudflare Turnstile verification for the public upload endpoint.
// CLAUDE.md section 18 lists Turnstile as a reuse-stack item "both siblings
// still owe" — real site/secret keys before any of these three projects'
// public endpoints are shared widely. This wires the verification call
// properly so it's live the moment TURNSTILE_SECRET_KEY is set; without a
// key configured it passes through (documented gap, not a silent bypass —
// logged once per call so it shows up in Vercel function logs).
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

export async function verifyTurnstile(token: string | null, remoteIp: string): Promise<TurnstileResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY not set — upload endpoint is NOT bot-protected. See CLAUDE.md section 18.");
    return { ok: true };
  }

  if (!token) {
    return { ok: false, reason: "missing_token" };
  }

  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: secretKey, response: token, remoteip: remoteIp }),
  });

  if (!response.ok) {
    return { ok: false, reason: "verification_request_failed" };
  }

  const result = (await response.json()) as { success: boolean; "error-codes"?: string[] };
  if (!result.success) {
    return { ok: false, reason: (result["error-codes"] ?? ["unknown"]).join(",") };
  }

  return { ok: true };
}
