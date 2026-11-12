import type { APIRoute } from 'astro';
import { groupsEnabled } from '../../lib/flags';

/**
 * Share a save to a group (PLAN.md §5): the group gets the link + note,
 * nothing else. RLS verifies membership and save ownership; the note is
 * copied at share time so editions stay stable snapshots.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!groupsEnabled()) {
    return Response.json({ error: 'Groups are not enabled.' }, { status: 404 });
  }
  const { user, supabase } = locals;
  if (!user) {
    return Response.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const form = await request.formData();
  const saveId = String(form.get('save_id') ?? '');
  const groupId = String(form.get('group_id') ?? '');
  const note = String(form.get('note') ?? '').trim() || null;
  const attributionOk = form.get('attribution_ok') === 'on';

  if (!saveId || !groupId) {
    return redirect('/?error=' + encodeURIComponent('Pick a group to share to.'));
  }

  const { data: save } = await supabase
    .from('saves')
    .select('id, link_id, note')
    .eq('id', saveId)
    .maybeSingle();
  if (!save) {
    return redirect('/?error=' + encodeURIComponent('That save was not found.'));
  }

  const finalNote = note ?? save.note;

  const { error } = await supabase.from('recommendations').insert({
    save_id: save.id,
    group_id: groupId,
    user_id: user.id,
    link_id: save.link_id,
    note: finalNote,
    attribution_ok: attributionOk,
  });

  if (error) {
    const msg = error.code === '23505' ? 'Already shared to that group.' : error.message;
    return redirect('/?error=' + encodeURIComponent(msg));
  }

  // Keep the note on the save too, so re-sharing elsewhere prefills it.
  if (note && note !== save.note) {
    await supabase.from('saves').update({ note }).eq('id', save.id);
  }

  // Remember the last-used group as the default for next time.
  await supabase.from('profiles').update({ last_shared_group_id: groupId }).eq('id', user.id);

  return redirect('/?shared=1');
};
