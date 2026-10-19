// GET   /api/admin/players — the player ledger
// PATCH /api/admin/players — change a player's XP, Aura or ban flag
// Admin only. Roles are NOT editable here: change a role by running SQL.
import { requireAdmin } from '@/lib/server/auth';
import { json, parseBody } from '@/lib/server/http';
import { playerUpdateSchema } from '@/lib/schemas';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.service
    .from('profiles')
    .select('id, username, level, xp, aura, role, is_banned')
    .order('level', { ascending: false });

  if (error) return json({ error: 'Could not load players' }, 500);
  return json({ players: data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await parseBody(request, playerUpdateSchema);
  if (body.error) return body.error;

  const { error } = await auth.service.rpc('admin_update_player', {
    p_admin_id: auth.user.id,
    p_user_id: body.data.userId,
    p_xp: body.data.xp,
    p_aura: body.data.aura,
    p_is_banned: body.data.isBanned,
  });

  if (error) return json({ error: error.message }, 400);
  return json({ success: true });
}
