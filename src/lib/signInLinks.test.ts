import { describe, expect, it } from 'vitest';
import { SIGN_IN_LINK_ERRORS, SIGN_IN_LINK_FAILED, signInLinkErrorFromHash, signInLinkFailurePath } from './signInLinks';

describe('signInLinkErrorFromHash', () => {
  it('explains a used or expired link', () => {
    expect(
      signInLinkErrorFromHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    ).toBe(SIGN_IN_LINK_ERRORS.otp_expired);
  });

  it('falls back to the general message for other errors', () => {
    expect(signInLinkErrorFromHash('#error=server_error&error_code=unexpected_failure')).toBe(SIGN_IN_LINK_FAILED);
    expect(signInLinkErrorFromHash('#error=access_denied')).toBe(SIGN_IN_LINK_FAILED);
  });

  it('ignores fragments with no error', () => {
    expect(signInLinkErrorFromHash('')).toBeNull();
    expect(signInLinkErrorFromHash('#delete-account')).toBeNull();
  });

  it('never shows Supabase’s own description', () => {
    expect(signInLinkErrorFromHash('#error=x&error_description=<b>hi</b>')).toBe(SIGN_IN_LINK_FAILED);
  });
});

describe('signInLinkFailurePath', () => {
  it('sends signed-in people on to where they were going, dropping the fragment', () => {
    expect(signInLinkFailurePath(true, '/')).toBe('/#');
    expect(signInLinkFailurePath(true, '/join/abc', 'otp_expired')).toBe('/join/abc#');
  });

  it('sends everyone else to sign in with a message', () => {
    expect(signInLinkFailurePath(false, '/', 'otp_expired')).toBe(
      '/login?error=' + encodeURIComponent(SIGN_IN_LINK_ERRORS.otp_expired)
    );
    expect(signInLinkFailurePath(false, '/')).toBe('/login?error=' + encodeURIComponent(SIGN_IN_LINK_FAILED));
    expect(signInLinkFailurePath(false, '/', 'flow_state_not_found')).toBe(
      '/login?error=' + encodeURIComponent(SIGN_IN_LINK_FAILED)
    );
  });
});
