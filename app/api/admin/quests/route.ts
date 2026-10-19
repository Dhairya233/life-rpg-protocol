// POST   /api/admin/quests  — create a global quest (no id) or edit one (with id)
// DELETE /api/admin/quests  — delete a global quest
// Admin only. Browsers have no write access to the quests table at all.
import { requireAdmin } from '@/lib/server/auth';
import { json, parseBody } from '@/lib/server/http';
import { questFormSchema, deleteQuestSchema } from '@/lib/schemas';

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await parseBody(request, questFormSchema);
  if (body.error) return body.error;
  const { id, ...fields } = body.data;      // zod already removed any unknown fields

  const query = id
    ? auth.service.from('quests').update(fields).eq('id', id)
    : auth.service.from('quests').insert(fields);
  const { error } = await query;

  if (error) return json({ error: 'Could not save quest' }, 400);
  return json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await parseBody(request, deleteQuestSchema);
  if (body.error) return body.error;

  const { error } = await auth.service.from('quests').delete().eq('id', body.data.id);
  // The usual reason: players already have attempts on this quest.
  if (error) return json({ error: 'Quest could not be deleted (is it in use?)' }, 409);
  return json({ success: true });
}
