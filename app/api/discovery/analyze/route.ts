// POST /api/discovery/analyze — the "Daily Discovery" (one per day).
//
// HONEST BEHAVIOUR: there is no image analysis. The text below is picked
// at random from a short list, and the response says `simulated: true`.
// The database function claim_daily_discovery enforces "once per day"
// (with a lock, so parallel requests cannot cheat) and decides the luck
// amount itself.
import { requireUser } from '@/lib/server/auth';
import { json, parseBody } from '@/lib/server/http';
import { discoverySchema } from '@/lib/schemas';

const SIMULATED_FEEDBACK = [
  'A peaceful offline moment, perfect for restoring mental bandwidth.',
  'Nutritious and vibrant. Excellent physical fuel for high focus.',
  'Quality active recovery detected. Resting builds true resilience.',
  'A serene setting carefully cultivated to clear the mind.',
];

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await parseBody(request, discoverySchema);
  if (body.error) return body.error;

  const summary = SIMULATED_FEEDBACK[Math.floor(Math.random() * SIMULATED_FEEDBACK.length)];

  const { data, error } = await auth.supabase.rpc('claim_daily_discovery', {
    p_image_ref: body.data.imageRef,
    p_summary: summary,
  });

  if (error) {
    console.error('claim_daily_discovery failed:', error.message);
    return json({ error: 'Failed to log discovery' }, 500);
  }
  if (data?.error === 'limit_reached') {
    return json({ error: 'Daily Discovery limit reached' }, 429);
  }

  return json({
    success: true,
    simulated: true,
    data: { analysis_summary: data.analysis_summary, luck_granted: data.luck_granted },
  });
}
