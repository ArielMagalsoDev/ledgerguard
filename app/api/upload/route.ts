import { NextRequest, NextResponse } from "next/server";
import { processUpload } from "@/lib/upload/process-upload";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/upload/rate-limit";
import { verifyTurnstile } from "@/lib/upload/turnstile";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/upload/session";

// Public entry point for the bring-your-own-invoice demo (ledgerguard.md).
// Feature-flagged off by default — the seeded five-scenario demo is the
// primary guided experience; this is the "prove it generalizes beyond
// fixtures" experiment layered on top, launched only when explicitly
// enabled.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (process.env.UPLOAD_SANDBOX_ENABLED !== "true") {
    return NextResponse.json({ error: "upload_sandbox_disabled" }, { status: 404 });
  }

  const clientKey = clientKeyFromHeaders(request.headers);
  const rateLimit = await checkRateLimit(clientKey);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many uploads from this connection in the last hour. Try again later, or explore the seeded scenarios instead." },
      { status: 429 }
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const turnstileToken = formData?.get("turnstileToken");
  const turnstile = await verifyTurnstile(
    typeof turnstileToken === "string" ? turnstileToken : null,
    clientKey
  );
  if (!turnstile.ok) {
    return NextResponse.json({ error: "turnstile_failed", reason: turnstile.reason }, { status: 403 });
  }

  const existingSessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionToken = existingSessionToken || createSessionToken();

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "unreadable_file" }, { status: 400 });
  }

  try {
    const result = await processUpload(bytes, file.name || "upload.pdf", sessionToken);

    const response =
      result.ok
        ? NextResponse.json({ invoiceId: result.invoiceId, outcome: result.outcome }, { status: 201 })
        : result.reason === "validation"
          ? NextResponse.json({ error: result.error, message: result.message }, { status: 422 })
          : result.reason === "processing_failed"
            ? NextResponse.json({ error: "processing_failed", message: result.message, invoiceId: result.invoiceId }, { status: 500 })
            : NextResponse.json(
                { error: "processing_incomplete", invoiceId: result.invoiceId, message: "Processing is taking longer than expected — check back at the result URL in a moment." },
                { status: 202 }
              );

    if (!existingSessionToken) {
      response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    }
    return response;
  } catch (err) {
    console.error("[POST /api/upload]", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
