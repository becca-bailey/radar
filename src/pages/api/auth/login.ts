import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, url, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  if (!email) {
    return redirect('/login?error=' + encodeURIComponent('Enter an email address.'));
  }

  // Only ever bounce back to a local path (e.g. the /join page that sent us here).
  const next = String(form.get('next') ?? '');
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '';
  const callback = `${url.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`;

  const { error } = await locals.supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback },
  });

  if (error) {
    return redirect('/login?error=' + encodeURIComponent(error.message));
  }
  return redirect('/login?sent=1');
};
