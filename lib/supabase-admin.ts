// lib/supabase-admin.ts
// ============================================================
// Supabase client that uses the SERVICE ROLE key.
//
// The service role key can do ANYTHING in the database (it skips all
// Row Level Security). So:
//   * `import 'server-only'` makes the build FAIL if a browser
//     component ever imports this file, so the key can't leak.
//   * The env variable has no NEXT_PUBLIC_ prefix, so Next.js never
//     ships it to the browser either.
//   * Only call this AFTER checking who the caller is (see
//     lib/server/auth.ts) — it is for trusted server code only.
// ============================================================
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (server env).');
  }

  // No session handling needed: this client is created per request.
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
