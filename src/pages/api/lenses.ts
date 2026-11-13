import type { APIRoute } from 'astro';
import { embedLensQuery, parseLensForm } from '../../lib/lenses';

/**
 * POST /api/lenses — create a lens (a saved search) from the Explore page
 * form, then land on it. RLS fills in and enforces the owner.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user) {
    return redirect('/login');
  }

  const parsed = parseLensForm(await request.formData());
  if ('error' in parsed) {
    return redirect('/explore?error=' + encodeURIComponent(parsed.error));
  }

  const { data, error } = await supabase
    .from('lenses')
    .insert({
      user_id: user.id,
      name: parsed.name,
      query: parsed.query,
      query_embedding: await embedLensQuery(parsed.query),
    })
    .select('id')
    .single();
  if (error) {
    return redirect('/explore?error=' + encodeURIComponent('Could not save the lens. Try again.'));
  }
  return redirect(`/explore?lens=${data.id}&created=1`);
};
