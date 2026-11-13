import type { APIRoute } from 'astro';
import { safeLocalPath } from '../../lib/redirects';

/** Flagging: the one interaction a non-owner can take on a link (PLAN.md §9). */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user) {
    return Response.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const form = await request.formData();
  const linkId = String(form.get('link_id') ?? '');
  const reason = String(form.get('reason') ?? '').slice(0, 500);
  const dest = safeLocalPath(String(form.get('back') ?? '/'));

  if (!linkId) return redirect(dest);

  const { error } = await supabase
    .from('flags')
    .insert({ link_id: linkId, user_id: user.id, reason });
  // Duplicate flag (23505) is fine — it is already in the queue.
  if (error && error.code !== '23505') {
    return redirect(dest + '?error=' + encodeURIComponent(error.message));
  }
  return redirect(dest + '?flagged=1');
};
