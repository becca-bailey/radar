import type { APIRoute } from 'astro';
import { createServiceClient } from '../../../lib/supabase';

/**
 * POST /api/account/delete — delete the signed-in user's account. The form
 * must carry confirm=delete (typed by the user). Deleting the auth user
 * cascades to the profile, saves, notes, tokens, lenses and memberships;
 * afterwards, archived links that nobody else saved are removed too.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user) {
    return redirect('/login');
  }

  const form = await request.formData();
  if (String(form.get('confirm') ?? '').trim().toLowerCase() !== 'delete') {
    return redirect('/settings?error=' + encodeURIComponent('Type "delete" to confirm.') + '#delete-account');
  }

  const service = createServiceClient();

  // Collect the links first: the saves that point at them go with the user.
  const { data: saveRows, error: savesError } = await service
    .from('saves')
    .select('link_id')
    .eq('user_id', user.id);
  if (savesError) {
    return redirect('/settings?error=' + encodeURIComponent('Could not delete your account. Try again.'));
  }
  const linkIds = [...new Set((saveRows ?? []).map((r) => r.link_id as string))];

  const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return redirect('/settings?error=' + encodeURIComponent('Could not delete your account. Try again.'));
  }

  // Best effort: the account is already gone, so a failure here only leaves
  // unreferenced page text behind, which no user can read.
  for (let i = 0; i < linkIds.length; i += 500) {
    await service.rpc('delete_orphan_links', { link_ids: linkIds.slice(i, i + 500) });
  }

  // Clears the session cookies (the server-side session no longer exists).
  await supabase.auth.signOut().catch(() => {});
  return redirect('/login?account_deleted=1');
};
