import type { APIRoute } from 'astro';
import { groupsEnabled } from '../../lib/flags';

/**
 * Share a save to a group (PLAN.md §5): the group gets the link + note,
 * never who shared it. RLS verifies membership and save ownership, and
 * refuses links the owner removed from the group. The note is copied at
 * share time, so editing it in your archive later doesn't change the group.
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
  });

  if (error) {
    let msg = error.code === '23505' ? 'Already shared to that group.' : 'Could not share that. Try again.';
    if (error.code === '42501') {
      const { data: removed } = await supabase
        .from('group_removed_links')
        .select('link_id')
        .eq('group_id', groupId)
        .eq('link_id', save.link_id)
        .maybeSingle();
      if (removed) msg = "The group's owner removed this link from the group.";
    }
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
