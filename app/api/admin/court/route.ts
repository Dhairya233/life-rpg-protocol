// GET  /api/admin/court — submissions waiting for review, with proof links
// POST /api/admin/court — settle one: approve | reject | penalize
// Admin only. The real work happens in the database function
// admin_resolve_submission, which re-checks the admin role itself.
import { requireAdmin } from '@/lib/server/auth';
import { json, parseBody } from '@/lib/server/http';
import { courtDecisionSchema } from '@/lib/schemas';

const PROOF_LINK_SECONDS = 300; // links stop working after 5 minutes

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { service } = auth;

  const { data, error } = await service
    .from('user_quests')
    .select(`
      id, user_id, proof_url, proof_submitted_at,
      quest:quests (title, xp_reward, aura_reward, skill_type, difficulty),
      submitter:profiles!user_quests_user_id_fkey (username)
    `)
    .eq('status', 'pending_verification')
    .order('proof_submitted_at', { ascending: true });

  if (error) return json({ error: 'Could not load submissions' }, 500);

  // The bucket is private, so each proof gets a short-lived signed link.
  const items = await Promise.all((data ?? []).map(async (row) => {
    let proofLink: string | null = null;
    if (row.proof_url) {
      const signed = await service.storage.from('submissions').createSignedUrl(row.proof_url, PROOF_LINK_SECONDS);
      proofLink = signed.data?.signedUrl ?? null;
    }
    return { ...row, proof_link: proofLink };
  }));

  return json({ items });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await parseBody(request, courtDecisionSchema);
  if (body.error) return body.error;

  const { error } = await auth.service.rpc('admin_resolve_submission', {
    p_admin_id: auth.user.id,
    p_user_quest_id: body.data.userQuestId,
    p_action: body.data.action,
  });

  if (error) return json({ error: error.message }, 400);
  return json({ success: true });
}
