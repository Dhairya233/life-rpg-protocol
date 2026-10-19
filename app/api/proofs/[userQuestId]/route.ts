// GET /api/proofs/:userQuestId — a short-lived link to view a proof image.
//
// The proof bucket is private. Who may look at a proof is decided by the
// DATABASE function get_proof_path_for_viewer:
//   * the owner of the submission, or
//   * a juror with enough Aura, while the submission is pending.
// Only then does the server (using the service key) sign a link that
// expires after 5 minutes.
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth';
import { json } from '@/lib/server/http';
import { createSupabaseAdmin } from '@/lib/supabase-admin';

const LINK_SECONDS = 300;

export async function GET(_request: Request, { params }: { params: { userQuestId: string } }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  if (!z.string().uuid().safeParse(params.userQuestId).success) {
    return json({ error: 'Invalid id' }, 400);
  }

  // Runs as the logged-in user, so the database sees the real caller.
  const { data: path, error } = await auth.supabase.rpc('get_proof_path_for_viewer', {
    p_user_quest_id: params.userQuestId,
  });
  if (error || !path) return json({ error: 'Not found' }, 404);

  const signed = await createSupabaseAdmin().storage.from('submissions').createSignedUrl(path, LINK_SECONDS);
  if (signed.error || !signed.data) return json({ error: 'Could not create link' }, 500);

  return json({ url: signed.data.signedUrl, expiresInSeconds: LINK_SECONDS });
}
