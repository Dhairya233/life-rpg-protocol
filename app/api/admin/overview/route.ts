// GET /api/admin/overview — numbers for the admin "Analytics" tab.
// Admin only (checked against the database role).
import { requireAdmin } from '@/lib/server/auth';
import { json } from '@/lib/server/http';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { service } = auth;

  const [players, quests, pending, logs] = await Promise.all([
    service.from('profiles').select('xp'),
    service.from('quests').select('*', { count: 'exact', head: true }),
    service.from('user_quests').select('*', { count: 'exact', head: true }).eq('status', 'pending_verification'),
    // PRIVACY: diary text is deliberately NOT selected. Admins see that an
    // entry was written, not what it says.
    service.from('daily_logs').select('id, xp_awarded, created_at, profiles(username)')
      .order('created_at', { ascending: false }).limit(15),
  ]);

  const rows = players.data ?? [];
  return json({
    players: rows.length,
    economyXp: rows.reduce((sum, p) => sum + (p.xp || 0), 0),
    quests: quests.count ?? 0,
    pending: pending.count ?? 0,
    activity: logs.data ?? [],
  });
}
