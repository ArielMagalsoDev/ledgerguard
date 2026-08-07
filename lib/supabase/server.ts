import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Service-role client — full DB access, bypasses RLS. Never import this from
// a client component. Nothing here is prefixed NEXT_PUBLIC_, so Next.js
// never inlines it into a client bundle regardless; this module is also
// imported directly by standalone scripts (tsx), which is why it doesn't use
// the `server-only` marker package — that package throws unconditionally
// outside Next's bundler ("react-server" resolve condition), which would
// break every script that needs this client.
let cached: ReturnType<typeof createClient<Database>> | null = null;

export function supabaseAdmin() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. See .env.example."
    );
  }

  cached = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cached;
}
