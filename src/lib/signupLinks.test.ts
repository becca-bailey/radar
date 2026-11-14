import { describe, expect, it } from 'vitest';
import { hashKey, overSignupLimit, signSignup, verifySignup } from './signupLinks';

const secret = 'test-secret';
const now = new Date('2026-11-14T12:00:00Z');
const payload = { email: 'pat@example.com', invite: 'abc123def456', exp: now.getTime() + 60_000 };

describe('signup links', () => {
  it('round-trips a signed payload', () => {
    expect(verifySignup(signSignup(payload, secret), secret, now)).toEqual(payload);
  });

  it('rejects an expired link', () => {
    const token = signSignup({ ...payload, exp: now.getTime() - 1 }, secret);
    expect(verifySignup(token, secret, now)).toBeNull();
  });

  it('rejects a different secret', () => {
    expect(verifySignup(signSignup(payload, secret), 'other', now)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const [, sig] = signSignup(payload, secret).split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'mallory@example.com', t: payload.invite, x: payload.exp })).toString(
      'base64url'
    );
    expect(verifySignup(`${forged}.${sig}`, secret, now)).toBeNull();
  });

  it('rejects junk', () => {
    expect(verifySignup('', secret, now)).toBeNull();
    expect(verifySignup('abc', secret, now)).toBeNull();
    expect(verifySignup('a.b.c', secret, now)).toBeNull();
  });
});

describe('hashKey', () => {
  it('is stable and separates kinds', () => {
    expect(hashKey('ip', '1.2.3.4', secret)).toBe(hashKey('ip', '1.2.3.4', secret));
    expect(hashKey('ip', 'x', secret)).not.toBe(hashKey('email', 'x', secret));
    expect(hashKey('email', 'pat@example.com', secret)).not.toContain('pat');
  });
});

describe('overSignupLimit', () => {
  it('allows sends under both limits', () => {
    expect(overSignupLimit({ byIp: 4, byEmail: 2 })).toBe(false);
  });

  it('stops at either limit', () => {
    expect(overSignupLimit({ byIp: 5, byEmail: 0 })).toBe(true);
    expect(overSignupLimit({ byIp: 0, byEmail: 3 })).toBe(true);
  });
});
