/**
 * Messages for a magic link that didn't sign anyone in. Supabase reports a
 * used or expired link in the URL fragment (`#error_code=otp_expired`), which
 * only the browser can read, so the server shows SIGN_IN_LINK_FAILED and the
 * sign-in page swaps in the specific message from the fragment.
 */
export const SIGN_IN_LINK_FAILED = "That sign-in link didn't work. Enter your email for a new one.";

export const SIGN_IN_LINK_ERRORS: Record<string, string> = {
  otp_expired: 'That sign-in link has already been used or has expired. Enter your email for a new one.',
};

/** The message for a fragment like `#error=…&error_code=otp_expired`, or null. */
export function signInLinkErrorFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('error') && !params.has('error_code')) return null;
  return SIGN_IN_LINK_ERRORS[params.get('error_code') ?? ''] ?? SIGN_IN_LINK_FAILED;
}

/**
 * Where /auth/callback sends a link that didn't sign anyone in. If an earlier
 * open of the same link already signed you in (a double tap, or a mail app
 * checking the link first), go on quietly. The empty `#` drops Supabase's
 * error fragment, which the browser would otherwise keep across the redirect.
 */
export function signInLinkFailurePath(signedIn: boolean, dest: string, errorCode?: string): string {
  if (signedIn) return dest.includes('#') ? dest : `${dest}#`;
  return '/login?error=' + encodeURIComponent(SIGN_IN_LINK_ERRORS[errorCode ?? ''] ?? SIGN_IN_LINK_FAILED);
}
