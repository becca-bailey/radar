import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Sign-up links for people arriving from a group invite link.
 *
 * Supabase's own sign-in email only works for accounts that already exist,
 * and creating the account up front would let anyone holding an invite link
 * create accounts for addresses they don't own. So Radar sends these itself:
 * the link carries the email and invite token, signed and short-lived, and
 * the account is created only when the link is clicked.
 */

export const SIGNUP_LINK_TTL_MS = 60 * 60 * 1000;

/** Sends allowed per hour, so the form can't be used to flood inboxes. */
export const SIGNUP_LIMITS = { perIp: 5, perEmail: 3 } as const;

export interface SignupPayload {
  /** Normalized email address. */
  email: string;
  /** The group invite token the sign-up started from. */
  invite: string;
  /** Expiry, epoch milliseconds. */
  exp: number;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function mac(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function signSignup(payload: SignupPayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify({ e: payload.email, t: payload.invite, x: payload.exp })));
  return `${body}.${b64url(mac(body, secret))}`;
}

/** The payload if the token is authentic and unexpired, else null. */
export function verifySignup(token: string, secret: string, now: Date = new Date()): SignupPayload | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = mac(body, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { e, t, x } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof e !== 'string' || typeof t !== 'string' || typeof x !== 'number') return null;
    if (x < now.getTime()) return null;
    return { email: e, invite: t, exp: x };
  } catch {
    return null;
  }
}

/** One-way hash for rate-limit keys, so raw emails and IPs aren't stored. */
export function hashKey(kind: 'ip' | 'email', value: string, secret: string): string {
  return b64url(mac(`${kind}:${value}`, secret));
}

/** True when another send would go over the hourly limits. */
export function overSignupLimit(sentLastHour: { byIp: number; byEmail: number }): boolean {
  return sentLastHour.byIp >= SIGNUP_LIMITS.perIp || sentLastHour.byEmail >= SIGNUP_LIMITS.perEmail;
}

/**
 * The secret for signing links and hashing keys. SIGNUP_LINK_SECRET if set;
 * otherwise derived from the service role key, which is already a server-only
 * secret (and rotating it invalidates outstanding links, which is fine).
 */
export function signupSecret(): string {
  const own = process.env.SIGNUP_LINK_SECRET ?? import.meta.env.SIGNUP_LINK_SECRET;
  if (own) return own;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  return createHmac('sha256', service).update('radar-signup-links').digest('hex');
}
