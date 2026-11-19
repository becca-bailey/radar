import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { safeLocalPath } from '../../lib/redirects';
import { signInLinkFailurePath } from '../../lib/signInLinks';

/**
 * Lands here from the magic-link email. Supports both the PKCE `?code=` flow
 * and the `?token_hash=&type=` template form, since the email template
 * controls which one arrives.
 *
 * A used or expired link arrives with neither: Supabase puts its error in the
 * fragment, which the browser keeps across the redirect to /login, where a
 * script shows the specific message.
 */
export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const dest = safeLocalPath(url.searchParams.get('next'));

  const fail = (errorCode?: string) => redirect(signInLinkFailurePath(Boolean(locals.user), dest, errorCode));

  if (tokenHash && type) {
    const { error } = await locals.supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return redirect(dest);
    console.error('verifyOtp failed:', error.code, error.message);
    return fail(error.code);
  }

  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirect(dest);
    console.error('exchangeCodeForSession failed:', error.code, error.message);
    return fail(error.code);
  }

  return fail();
};
