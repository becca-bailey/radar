import type { APIRoute } from 'astro';
import { safeLocalPath } from '../../../lib/redirects';

/**
 * POST /api/saves/restore — Undo for a delete. Puts the save back from the
 * one-day trash with its date, note and group shares. Returns to the page
 * the Undo was on.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user) {
    return redirect('/login');
  }
  const form = await request.formData();
  const returnPath = safeLocalPath(String(form.get('return_path') ?? ''));
  const sep = returnPath.includes('?') ? '&' : '?';
  const { data, error } = await supabase.rpc('restore_save', { tid: String(form.get('trash_id') ?? '') });
  if (error || !data) {
    return redirect(`${returnPath}${sep}error=${encodeURIComponent("Couldn't restore that save. It may already be back, or saved again.")}`);
  }
  return redirect(`${returnPath}${sep}restored=1`);
};
