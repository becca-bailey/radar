import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, url, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  if (!email) {
    return redirect('/login?error=' + encodeURIComponent('Enter an email address.'));
  }

  const { error } = await locals.supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${url.origin}/auth/callback` },
  });

  if (error) {
    return redirect('/login?error=' + encodeURIComponent(error.message));
  }
  return redirect('/login?sent=1');
};
