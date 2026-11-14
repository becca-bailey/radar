import type { APIRoute } from 'astro';
import { ensureInvitedUser, isInvited, normalizeEmail } from '../../../lib/invites';
import { findInviteLink, inviteState, joinToken } from '../../../lib/inviteLinks';
import { groupsEnabled } from '../../../lib/flags';
import { mailConfigured, sendEmail } from '../../../lib/mail';
import { safeLocalPath } from '../../../lib/redirects';
import {
  SIGNUP_LINK_TTL_MS,
  hashKey,
  overSignupLimit,
  signSignup,
  signupSecret,
} from '../../../lib/signupLinks';
import { createServiceClient } from '../../../lib/supabase';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const INVITE_ONLY =
  "Radar is invite-only during the beta, and that email isn't on the list. If you already have an account, check the address. Otherwise you'll need an invite, or a group's invite link.";

/**
 * Send a sign-in link.
 *
 * - Existing accounts, and emails on the beta list, get Supabase's magic link.
 * - A new email that started from an open group invite link
 *   (`next=/join/<token>`) gets a sign-up link Radar sends itself; the
 *   account is created only when that link is clicked (/auth/signup).
 * - Anyone else gets no email. The OTP call never creates users itself.
 */
export const POST: APIRoute = async ({ request, locals, url, redirect, clientAddress }) => {
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
  const sent = () => redirect(back('sent=1'));

  const email = normalizeEmail(String(form.get('email') ?? ''));
  if (!email) return fail('Enter a valid email address.');

  const callback = `${url.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`;

  const service = createServiceClient();
  const invited = await isInvited(service, email);
  if (invited) {
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
  if (!error) return sent();

  // With shouldCreateUser off, an unknown address fails here.
  const unknown = !invited && /signups? not allowed|not found|user/i.test(error.message);
  if (!unknown) return fail(error.message);
  const invite = token ? await findInviteLink(service, token) : null;
  if (!token || inviteState(invite).status !== 'open') return fail(INVITE_ONLY);
  if (!mailConfigured()) {
    console.error('RESEND_API_KEY is not set: sign-ups from invite links are off.');
    return fail("New sign-ups from invite links aren't switched on yet. Ask whoever sent the link.");
  }
  const groupName = invite?.groups?.name ?? 'a group';

  // New person with an open invite link: rate-limit, then send the sign-up link.
  const secret = signupSecret();
  const ip = request.headers.get('x-nf-client-connection-ip') ?? clientAddress ?? 'unknown';
  const ipHash = hashKey('ip', ip, secret);
  const emailHash = hashKey('email', email, secret);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [{ count: byIp, error: ipError }, { count: byEmail, error: emailError }] = await Promise.all([
    service.from('signup_emails').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('sent_at', hourAgo),
    service
      .from('signup_emails')
      .select('id', { count: 'exact', head: true })
      .eq('email_hash', emailHash)
      .gte('sent_at', hourAgo),
  ]);
  if (ipError || emailError) {
    // Fail closed: no rate limit, no sending.
    console.error('signup_emails unavailable (is migration 20261119000000 applied?):', (ipError ?? emailError)!.message);
    return fail("Sign-up isn't working right now. Try again later.");
  }
  if (overSignupLimit({ byIp: byIp ?? 0, byEmail: byEmail ?? 0 })) {
    return fail('Too many sign-up emails in the last hour. Try again later, or check your inbox for the last one.');
  }

  const link = `${url.origin}/auth/signup?t=${signSignup(
    { email, invite: token, exp: Date.now() + SIGNUP_LINK_TTL_MS },
    secret
  )}`;
  try {
    await sendEmail({
      to: email,
      subject: `Finish joining ${groupName} on Radar`,
      text: `This address was entered to join ${groupName} on Radar.\n\nCreate your account and join:\n${link}\n\nThe link works for an hour. If this wasn't you, ignore this email and no account will be created.`,
      html: `<p>This address was entered to join ${escapeHtml(groupName)} on Radar.</p><p><a href="${link}">Create your account and join</a></p><p>The link works for an hour. If this wasn't you, ignore this email and no account will be created.</p>`,
    });
  } catch {
    return fail("Couldn't send the email. Try again in a minute.");
  }

  await service.from('signup_emails').insert({ ip_hash: ipHash, email_hash: emailHash });
  // Keep the table to a day of rows.
  await service.from('signup_emails').delete().lt('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  return sent();
};
