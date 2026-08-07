// QuickBooks Online sandbox integration (CLAUDE.md section 18/19 Phase 5).
//
// Scope, deliberately: DRAFT BILLS ONLY. This module never calls the QBO
// BillPayment endpoint and never will — "never moves money on a guess" is
// the whole point of this project. A created Bill is an unpaid AP liability
// sitting in QuickBooks for a human to review and pay through QuickBooks
// itself, same as every other draft this app proposes.
//
// Tokens live in `accounting_connections`, one row per (provider,
// environment) — not in this process's memory — because this code runs
// from both the Next.js server (serverless, no persistent memory between
// requests) and standalone scripts. `getActiveConnection` is the only
// function that should read/refresh tokens; everything else calls it.
//
// Gotcha (see HANDOFF.md): Intuit rotates the refresh token on every use.
// Persist the NEW refresh_token after every refresh — reusing a stale one
// invalidates the whole connection and forces a fresh OAuth consent.
import OAuthClient from "intuit-oauth";
import type { supabaseAdmin } from "@/lib/supabase/server";
import type { AccountingChangeSet } from "@/lib/types";

type Db = ReturnType<typeof supabaseAdmin>;
type AccountingConnection = {
  id: string;
  provider: string;
  environment: string;
  realm_id: string;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  connected_at: string;
  updated_at: string;
};

const PROVIDER = "quickbooks";
const REFRESH_SKEW_MS = 5 * 60 * 1000; // refresh 5 minutes before actual expiry, not exactly at it

function qboEnvironment(): "sandbox" | "production" {
  return process.env.QBO_ENVIRONMENT === "production" ? "production" : "sandbox";
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

/** A fresh, unauthenticated OAuthClient — safe to construct per-call, it holds no server state of its own until `setToken` is called. */
export function makeOAuthClient(): OAuthClient {
  return new OAuthClient({
    clientId: requiredEnv("QBO_CLIENT_ID"),
    clientSecret: requiredEnv("QBO_CLIENT_SECRET"),
    environment: qboEnvironment(),
    redirectUri: requiredEnv("QBO_REDIRECT_URI"),
  });
}

/** The Accounting-scope consent URL to send an admin to. `state` is the CSRF token the callback route must verify. */
export function buildAuthorizeUrl(state: string): string {
  const client = makeOAuthClient();
  return client.authorizeUri({ scope: [OAuthClient.scopes.Accounting], state });
}

/**
 * Exchanges the OAuth `code` on the callback URL for tokens and upserts the
 * single (provider, environment) connection row. `callbackUrl` must be the
 * full URL Intuit redirected to, including the query string — the SDK reads
 * `code` and `realmId` off it directly.
 */
export async function exchangeCodeForConnection(db: Db, callbackUrl: string): Promise<AccountingConnection> {
  const client = makeOAuthClient();
  const authResponse = await client.createToken(callbackUrl);
  const token = authResponse.getToken();

  if (!token.access_token || !token.refresh_token || !token.realmId) {
    throw new Error("QuickBooks token exchange succeeded but the response is missing access_token/refresh_token/realmId.");
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const environment = qboEnvironment();

  const { data, error } = await db
    .from("accounting_connections")
    .upsert(
      {
        provider: PROVIDER,
        environment,
        realm_id: token.realmId,
        access_token: token.access_token,
        access_token_expires_at: new Date(now + (token.expires_in ?? 3600) * 1000).toISOString(),
        refresh_token: token.refresh_token,
        refresh_token_expires_at: new Date(now + (token.x_refresh_token_expires_in ?? 8_726_400) * 1000).toISOString(),
        connected_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "provider,environment" }
    )
    .select("*")
    .single();

  if (error || !data) throw new Error(`Failed to persist QuickBooks connection: ${error?.message}`);
  return data;
}

/**
 * Returns a connection with a currently-valid access token, transparently
 * refreshing (and re-persisting) if it's expired or about to be. This is
 * the only path that should ever be used to read a QBO token.
 */
export async function getActiveConnection(db: Db): Promise<AccountingConnection> {
  const environment = qboEnvironment();
  const { data: conn, error } = await db
    .from("accounting_connections")
    .select("*")
    .eq("provider", PROVIDER)
    .eq("environment", environment)
    .maybeSingle();

  if (error) throw new Error(`Failed to read accounting_connections: ${error.message}`);
  if (!conn) {
    throw new Error(
      `No QuickBooks Online (${environment}) connection on file. Visit /api/accounting/qbo/connect?token=<ADMIN_SETUP_TOKEN> to connect.`
    );
  }

  const accessExpiresAt = new Date(conn.access_token_expires_at).getTime();
  if (Date.now() < accessExpiresAt - REFRESH_SKEW_MS) {
    return conn;
  }

  const refreshExpiresAt = new Date(conn.refresh_token_expires_at).getTime();
  if (Date.now() >= refreshExpiresAt) {
    throw new Error(
      "QuickBooks refresh token has expired — re-authorize at /api/accounting/qbo/connect?token=<ADMIN_SETUP_TOKEN>."
    );
  }

  const client = makeOAuthClient();
  const authResponse = await client.refreshUsingToken(conn.refresh_token);
  const token = authResponse.getToken();
  if (!token.access_token || !token.refresh_token) {
    throw new Error("QuickBooks token refresh did not return a new access_token/refresh_token.");
  }

  const now = Date.now();
  const { data: updated, error: updateError } = await db
    .from("accounting_connections")
    .update({
      access_token: token.access_token,
      access_token_expires_at: new Date(now + (token.expires_in ?? 3600) * 1000).toISOString(),
      // Rotated refresh token — MUST be saved, see file header.
      refresh_token: token.refresh_token,
      refresh_token_expires_at: new Date(now + (token.x_refresh_token_expires_in ?? 8_726_400) * 1000).toISOString(),
      updated_at: new Date(now).toISOString(),
    })
    .eq("id", conn.id)
    .select("*")
    .single();

  if (updateError || !updated) throw new Error(`Failed to persist refreshed QuickBooks tokens: ${updateError?.message}`);
  return updated;
}

type QboApiCallOptions = {
  method?: "GET" | "POST";
  path: string; // e.g. "/query", "/bill", "/vendor"
  body?: unknown;
  params?: Record<string, string>;
};

/** Escapes a value for QBO's SQL-like query language (single quotes only — this project never interpolates anything else into a query string). */
export function escapeQboQueryValue(value: string): string {
  return value.replace(/'/g, "''");
}

/** Authenticated call against `/v3/company/{realmId}{path}`, auto-refreshing the token first if needed. Throws with the QBO Fault detail on any error response. */
export async function qboApiCall<T>(db: Db, { method = "GET", path, body, params }: QboApiCallOptions): Promise<T> {
  const conn = await getActiveConnection(db);
  const client = makeOAuthClient();
  client.setToken({
    access_token: conn.access_token,
    refresh_token: conn.refresh_token,
    token_type: "bearer",
    realmId: conn.realm_id,
  });

  // NB: getQBOEnvironmentURI() is the QBO *web app* host (sandbox.qbo.intuit.com) —
  // wrong for REST calls and silently returns 405s. getEnvironmentURI() is the
  // actual API host (sandbox-quickbooks.api.intuit.com).
  const url = `${client.getEnvironmentURI()}v3/company/${conn.realm_id}${path}`;
  const resp = await client.makeApiCall({
    url,
    method,
    params: { minorversion: "65", ...params },
    ...(body !== undefined ? { body } : {}),
  });

  const fault = resp.json?.Fault;
  if (resp.status >= 400 || fault) {
    const detail = fault?.Error?.map((e: { Message: string; Detail?: string; code?: string }) => `${e.Message}${e.Detail ? ` — ${e.Detail}` : ""} (code ${e.code})`).join("; ");
    throw new Error(`QuickBooks API error (${resp.status}): ${detail ?? resp.body}`);
  }

  return resp.json as T;
}

type QboVendor = { Id: string; DisplayName: string; SyncToken?: string };
type QboAccount = { Id: string; Name: string; AccountType: string };
type QboBill = { Id: string; DocNumber?: string; SyncToken?: string; TotalAmt?: number };

async function qboQuery<T>(db: Db, sql: string): Promise<T[]> {
  const json = await qboApiCall<{ QueryResponse?: Record<string, unknown[]> }>(db, {
    path: "/query",
    params: { query: sql },
  });
  const key = Object.keys(json.QueryResponse ?? {}).find((k) => k !== "startPosition" && k !== "maxResults" && k !== "totalCount");
  return key ? ((json.QueryResponse?.[key] ?? []) as T[]) : [];
}

export async function findVendorByName(db: Db, name: string): Promise<QboVendor | null> {
  const rows = await qboQuery<QboVendor>(db, `select * from Vendor where DisplayName = '${escapeQboQueryValue(name)}'`);
  return rows[0] ?? null;
}

async function createVendor(db: Db, name: string): Promise<QboVendor> {
  const json = await qboApiCall<{ Vendor: QboVendor }>(db, {
    method: "POST",
    path: "/vendor",
    body: { DisplayName: name },
  });
  return json.Vendor;
}

/**
 * QuickBooks has no notion of Keystone's approved-supplier master, so a
 * sandbox company starts with none of these vendors. Creating the AP vendor
 * record for an already-approved LedgerGuard supplier is a lower-risk,
 * one-directional sync (name only — bank details never flow into it) and is
 * standard practice for accounting-system integrations. This is NOT the
 * same guardrail as "never auto-create a supplier" in lib/matching/supplier.ts
 * — that rule protects LedgerGuard's own fraud/duplicate-payment controls;
 * this just mirrors an already-vetted supplier into the books.
 */
export async function getOrCreateVendor(db: Db, name: string): Promise<{ vendor: QboVendor; created: boolean }> {
  const existing = await findVendorByName(db, name);
  if (existing) return { vendor: existing, created: false };
  return { vendor: await createVendor(db, name), created: true };
}

export async function findExistingBillByDocNumber(db: Db, vendorId: string, docNumber: string): Promise<QboBill | null> {
  const rows = await qboQuery<QboBill>(
    db,
    `select * from Bill where VendorRef = '${escapeQboQueryValue(vendorId)}' and DocNumber = '${escapeQboQueryValue(docNumber)}'`
  );
  return rows[0] ?? null;
}

let cachedExpenseAccountId: string | null = null;

/**
 * LedgerGuard's fictional GL codes (e.g. "6120-SUPPLIES", from
 * lib/matching/routing.ts) don't exist in an unmodified QBO sandbox's chart
 * of accounts — a real deployment would sync a real chart of accounts first,
 * which is out of scope for this demo. Every bill line instead posts to the
 * first Expense-type account the sandbox company has, with the intended GL
 * code preserved in the line description for traceability. Stated here
 * rather than silently pretended away, same honesty pattern CLAUDE.md uses
 * elsewhere (section 14's malware-scanning note).
 */
export async function getDefaultExpenseAccountId(db: Db): Promise<string> {
  if (cachedExpenseAccountId) return cachedExpenseAccountId;
  const rows = await qboQuery<QboAccount>(db, `select * from Account where AccountType = 'Expense'`);
  const account = rows[0];
  if (!account) throw new Error("No Expense-type account found in the QuickBooks chart of accounts — cannot map bill lines.");
  cachedExpenseAccountId = account.Id;
  return account.Id;
}

export type CreateDraftBillResult = {
  billRow: {
    id: string;
    invoice_id: string;
    decision_id: string;
    idempotency_key: string;
    provider: string;
    external_bill_id: string | null;
    external_doc_number: string | null;
    status: string;
    request_payload: unknown;
    response_summary: unknown;
    error_message: string | null;
    created_at: string;
  };
  alreadyExisted: boolean;
};

/**
 * Maps an approved AccountingChangeSet to a QuickBooks Bill (an unpaid AP
 * liability — never a BillPayment) and records the result in
 * `accounting_bills`. Idempotent at three layers, cheapest first:
 *   1. Local `accounting_bills.idempotency_key` (UNIQUE constraint) — no QBO
 *      call at all on replay.
 *   2. A direct QBO query for an existing Bill with the same vendor +
 *      DocNumber, in case a prior attempt created a bill but this table's
 *      own insert never landed.
 *   3. The DB's UNIQUE(idempotency_key) constraint itself, as a last-resort
 *      race guard if two callers somehow reach step 3 concurrently.
 * Never retried automatically past a failure — CLAUDE.md section 13's "do
 * not retry permanent validation failures" applies here as much as anywhere.
 */
export async function createDraftBill(
  db: Db,
  changeSet: AccountingChangeSet,
  context: { invoiceId: string; decisionId: string; supplierName: string }
): Promise<CreateDraftBillResult> {
  if (changeSet.action !== "create_bill") {
    throw new Error(`createDraftBill called with action="${changeSet.action}", expected "create_bill".`);
  }

  const { data: existingRow, error: existingError } = await db
    .from("accounting_bills")
    .select("*")
    .eq("idempotency_key", changeSet.idempotencyKey)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to check accounting_bills for existing draft: ${existingError.message}`);
  if (existingRow) return { billRow: existingRow, alreadyExisted: true };

  const { vendor } = await getOrCreateVendor(db, context.supplierName);
  const docNumber = changeSet.invoiceNumber.slice(0, 21); // QBO DocNumber max length

  const existingQboBill = await findExistingBillByDocNumber(db, vendor.Id, docNumber);
  if (existingQboBill) {
    const { data: recovered, error: recoverError } = await db
      .from("accounting_bills")
      .insert({
        invoice_id: context.invoiceId,
        decision_id: context.decisionId,
        idempotency_key: changeSet.idempotencyKey,
        provider: PROVIDER,
        external_bill_id: existingQboBill.Id,
        external_doc_number: existingQboBill.DocNumber ?? null,
        status: "created",
        request_payload: changeSet,
        response_summary: { recoveredFromExistingQboBill: true, Id: existingQboBill.Id },
      })
      .select("*")
      .single();
    if (recoverError) {
      // A unique-violation here just means another concurrent call already recorded this key — return that row.
      const { data: raced } = await db.from("accounting_bills").select("*").eq("idempotency_key", changeSet.idempotencyKey).maybeSingle();
      if (raced) return { billRow: raced, alreadyExisted: true };
      throw new Error(`Bill already existed in QuickBooks (Id=${existingQboBill.Id}) but failed to record locally: ${recoverError.message}`);
    }
    return { billRow: recovered, alreadyExisted: true };
  }

  const expenseAccountId = await getDefaultExpenseAccountId(db);
  const billPayload = {
    VendorRef: { value: vendor.Id },
    DocNumber: docNumber,
    TxnDate: changeSet.invoiceDate,
    DueDate: changeSet.dueDate,
    CurrencyRef: { value: changeSet.currency },
    PrivateNote: `LedgerGuard draft — cost center ${changeSet.costCenter}. Never mark paid from this integration. idempotencyKey=${changeSet.idempotencyKey}`,
    Line: changeSet.lineItems.map((li) => ({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: Number(li.amount),
      Description: `${li.description} (qty ${li.quantity} @ ${li.unitPrice}; GL ${li.accountCode})`,
      AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } },
    })),
  };

  let created: QboBill;
  try {
    const json = await qboApiCall<{ Bill: QboBill }>(db, { method: "POST", path: "/bill", body: billPayload });
    created = json.Bill;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("accounting_bills").insert({
      invoice_id: context.invoiceId,
      decision_id: context.decisionId,
      idempotency_key: changeSet.idempotencyKey,
      provider: PROVIDER,
      status: "failed",
      request_payload: billPayload,
      error_message: message,
    });
    throw err;
  }

  const { data: billRow, error: insertError } = await db
    .from("accounting_bills")
    .insert({
      invoice_id: context.invoiceId,
      decision_id: context.decisionId,
      idempotency_key: changeSet.idempotencyKey,
      provider: PROVIDER,
      external_bill_id: created.Id,
      external_doc_number: created.DocNumber ?? null,
      status: "created",
      request_payload: billPayload,
      response_summary: { Id: created.Id, SyncToken: created.SyncToken, TotalAmt: created.TotalAmt },
    })
    .select("*")
    .single();

  if (insertError) {
    // Bill genuinely exists in QBO now — a local unique-violation race is the
    // only case worth recovering from silently; anything else must surface.
    const { data: raced } = await db.from("accounting_bills").select("*").eq("idempotency_key", changeSet.idempotencyKey).maybeSingle();
    if (raced) return { billRow: raced, alreadyExisted: true };
    throw new Error(`Bill created in QuickBooks (Id=${created.Id}) but failed to record locally: ${insertError.message}`);
  }

  return { billRow, alreadyExisted: false };
}
