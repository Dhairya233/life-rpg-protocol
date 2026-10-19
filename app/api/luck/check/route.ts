// GET /api/luck/check — has the user already rolled today, and what did they get?
import { requireUser } from '@/lib/server/auth';
import { json } from '@/lib/server/http';

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  // The database function uses CURRENT_DATE (UTC); we use the same day here.
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await auth.supabase
    .from('daily_luck_rolls')
    .select('luck_value, is_grind_day')
    .eq('user_id', auth.user.id)
    .eq('roll_date', today)
    .maybeSingle();

  if (error) {
    console.error('luck check failed:', error.message);
    return json({ error: 'DB error' }, 500);
  }
  if (!data) return json({ success: true, rolled: false });
  return json({ success: true, rolled: true, luck_value: data.luck_value, is_grind_day: data.is_grind_day });
}
