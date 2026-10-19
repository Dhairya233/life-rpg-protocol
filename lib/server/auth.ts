// lib/server/auth.ts
// ============================================================
// "Who is calling?" checks for API routes. Every route starts with one
// of these two functions, so the rule is easy to audit:
//
//   requireUser()  -> the caller must be logged in
//   requireAdmin() -> logged in AND role = 'admin' in the DATABASE
//
// Both return { error } (a ready 401/403 response) or the verified user.
// ============================================================
import 'server-only';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { json } from './http';

export async function requireUser() {
  const supabase = await createSupabaseServer();
  // getUser() asks Supabase Auth to validate the token. (getSession() would
  // only read the cookie, which a client could forge.)
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: json({ error: 'Unauthorized' }, 401) };
  }
  return { user, supabase };
}

export async function requireAdmin() {
  const auth = await requireUser();
  if (auth.error) return { error: auth.error };

  // The role is read from the database with the server key, never from the
  // browser. Roles can only be changed by running SQL by hand.
  const service = createSupabaseAdmin();
  const { data: profile } = await service
    .from('profiles')
    .select('role, is_banned')
    .eq('id', auth.user.id)
    .single();

  if (profile?.role !== 'admin' || profile.is_banned) {
    return { error: json({ error: 'Forbidden' }, 403) };
  }
  return { user: auth.user, service };
}
