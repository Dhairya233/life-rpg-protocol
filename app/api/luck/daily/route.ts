// POST /api/luck/daily — roll today's luck (one roll per day, enforced by the database).
import { requireUser } from '@/lib/server/auth';
import { json } from '@/lib/server/http';

export async function POST() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  // No user id is sent: the database function uses the logged-in user.
  const { data, error } = await auth.supabase.rpc('roll_daily_luck');
  if (error) {
    console.error('roll_daily_luck failed:', error.message);
    return json({ error: 'Failed to roll luck' }, 500);
  }
  return json({ success: true, ...data });
}
