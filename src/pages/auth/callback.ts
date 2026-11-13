import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeLocalPath } from '../../lib/redirects';

/**
 * Lands here from the magic-link email. Supports both the PKCE `?code=` flow
 * and the `?token_hash=&type=` template form, since the email template
 * controls which one arrives.
 */
export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const dest = safeLocalPath(url.searchParams.get('next'));

  if (tokenHash && type) {
    const { error } = await locals.supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return redirect(dest);
    return redirect('/login?error=' + encodeURIComponent(error.message));
  }

  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirect(dest);
    return redirect('/login?error=' + encodeURIComponent(error.message));
  }

  return redirect('/login?error=' + encodeURIComponent('Sign-in link was missing its token.'));
};
