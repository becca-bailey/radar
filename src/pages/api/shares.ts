import type { APIRoute } from 'astro';
import { groupsEnabled } from '../../lib/flags';

/**
 * POST /api/shares — share a save to a group, or unshare it. A save can be
 * shared to many groups; each group sees its link and note, never who saved
 * it. The `action` field picks:
 *   share   — link the save to group_id, optionally updating its note first
 *   unshare — remove that link (your save stays in your archive)
 * RLS checks you own the save and are in the group, and refuses links the
 * group's owner removed.
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
  const action = String(form.get('action') ?? 'share');
  const saveId = String(form.get('save_id') ?? '');
  const groupId = String(form.get('group_id') ?? '');
  const fail = (msg: string) => redirect('/?error=' + encodeURIComponent(msg));

  if (!saveId || !groupId) {
    return fail('Pick a group.');
  }

  if (action === 'unshare') {
    const { data, error } = await supabase
      .from('shares')
      .delete()
      .eq('save_id', saveId)
      .eq('group_id', groupId)
      .select('save_id');
    if (error || !data?.length) return fail('Could not unshare that.');
    return redirect('/?unshared=1');
  }

  const { data: save } = await supabase.from('saves').select('id, note').eq('id', saveId).maybeSingle();
  if (!save) {
    return fail('That save was not found.');
  }

  // The group shows the save's own note, so a note typed here goes on the save.
  const note = String(form.get('note') ?? '').trim() || null;
  if (note && note !== save.note) {
    await supabase.from('saves').update({ note }).eq('id', save.id);
  }

  const { error } = await supabase.from('shares').insert({ save_id: save.id, group_id: groupId });
  if (error) {
    if (error.code === '23505') return fail('Already shared to that group.');
    // RLS refusal: you're in the group (it was offered), so this is almost
    // always a link the owner removed.
    if (error.code === '42501') return fail("Couldn't share to that group. Its owner may have removed this link.");
    return fail('Could not share that. Try again.');
  }

  // Remember the last-used group as the default for next time.
  await supabase.from('profiles').update({ last_shared_group_id: groupId }).eq('id', user.id);

  return redirect('/?shared=1');
};
