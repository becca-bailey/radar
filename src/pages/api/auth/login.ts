import type { APIRoute } from 'astro';
import { ensureInvitedUser, isInvited, normalizeEmail } from '../../../lib/invites';
import { findInviteLink, inviteState, joinToken } from '../../../lib/inviteLinks';
import { groupsEnabled } from '../../../lib/flags';
import { safeLocalPath } from '../../../lib/redirects';
import { createServiceClient } from '../../../lib/supabase';

const INVITE_ONLY =
  "Radar is invite-only during the beta, and that email isn't on the list. If you already have an account, check the address. Otherwise you'll need an invite, or a group's invite link.";

/**
 * Send a magic link. Sign-up is invite-only: an email can create an account
 * if it's on the beta list, or if the sign-in started from an open group
 * invite link (`next=/join/<token>`). The OTP call never creates users
 * itself, so any other new address gets no email.
 */
export const POST: APIRoute = async ({ request, locals, url, redirect }) => {
  const form = await request.formData();

  // Only ever bounce back to a local path (e.g. the /join page that sent us here).
  const safeNext = safeLocalPath(String(form.get('next') ?? ''), '');
  const token = groupsEnabled() ? joinToken(safeNext) : null;

  // Messages go back to the page the form was on: the join page for an
  // invite link, the sign-in page otherwise (keeping `next`).
  const back = (params: string) =>
    token
      ? `${safeNext}?${params}`
      : `/login?${params}${safeNext ? `&next=${encodeURIComponent(safeNext)}` : ''}`;
  const fail = (message: string) => redirect(back('error=' + encodeURIComponent(message)));

  const email = normalizeEmail(String(form.get('email') ?? ''));
  if (!email) return fail('Enter a valid email address.');

  const callback = `${url.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`;

  const service = createServiceClient();
  let mayCreate = await isInvited(service, email);
  if (!mayCreate && token) {
    // The join page checks the link again (and counts the use) on arrival.
    mayCreate = inviteState(await findInviteLink(service, token)).status === 'open';
  }
  if (mayCreate) {
    try {
      await ensureInvitedUser(service, email);
    } catch {
      return fail('Could not set up your account. Try again.');
    }
  }

  const { error } = await locals.supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback, shouldCreateUser: false },
  });

  if (error) {
    // With shouldCreateUser off, an unknown address fails here.
    return fail(!mayCreate && /signups? not allowed|not found|user/i.test(error.message) ? INVITE_ONLY : error.message);
  }
  return redirect(back('sent=1'));
};
