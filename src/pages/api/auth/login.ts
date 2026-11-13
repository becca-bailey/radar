import type { APIRoute } from 'astro';
import { ensureInvitedUser, isInvited, normalizeEmail } from '../../../lib/invites';
import { safeLocalPath } from '../../../lib/redirects';
import { createServiceClient } from '../../../lib/supabase';

const INVITE_ONLY =
  "Radar is invite-only during the beta, and that email isn't on the list. If you already have an account, check the address.";

/**
 * Send a magic link. Sign-up is invite-only: an invited email gets its
 * account created here, and the OTP call never creates users itself, so an
 * address with no account and no invite gets no email.
 */
export const POST: APIRoute = async ({ request, locals, url, redirect }) => {
  const form = await request.formData();
  const email = normalizeEmail(String(form.get('email') ?? ''));
  if (!email) {
    return redirect('/login?error=' + encodeURIComponent('Enter a valid email address.'));
  }

  // Only ever bounce back to a local path (e.g. the /join page that sent us here).
  const safeNext = safeLocalPath(String(form.get('next') ?? ''), '');
  const callback = `${url.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`;

  const service = createServiceClient();
  const invited = await isInvited(service, email);
  if (invited) {
    try {
      await ensureInvitedUser(service, email);
    } catch {
      return redirect('/login?error=' + encodeURIComponent('Could not set up your account. Try again.'));
    }
  }

  const { error } = await locals.supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback, shouldCreateUser: false },
  });

  if (error) {
    // With shouldCreateUser off, an unknown address fails here.
    const message = !invited && /signups? not allowed|not found|user/i.test(error.message) ? INVITE_ONLY : error.message;
    return redirect('/login?error=' + encodeURIComponent(message));
  }
  return redirect('/login?sent=1');
};
