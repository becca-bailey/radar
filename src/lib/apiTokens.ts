import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Tokens look like rdr_<base64url>. Only the SHA-256 hash is stored. */
export function generateApiToken(): { raw: string; hash: string } {
  const raw = 'rdr_' + randomBytes(24).toString('base64url');
  return { raw, hash: hashApiToken(raw) };
}

export function hashApiToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export type BearerLookup =
  | { userId: string; failure?: never }
  | { userId: null; failure: 'no_token' | 'unknown_token' };

/**
 * Resolve a Bearer token to a user id. Uses the service client (token
 * lookup happens before any user is known). The two failure modes are
 * distinguished so callers can say whether a token never arrived (e.g.
 * the Shortcut's token field is empty) or arrived but matched
 * nothing (wrong environment, revoked, mistyped).
 */
export async function userIdForBearerToken(
  service: SupabaseClient,
  authorizationHeader: string | null
): Promise<BearerLookup> {
  // rdr_ is current; rh_ tokens from before the rename keep working.
  // Tolerate surrounding whitespace: tokens get hand-pasted on phones.
  const match = authorizationHeader?.match(/^\s*Bearer\s+((?:rdr|rh)_[A-Za-z0-9_-]+)\s*$/);
  if (!match) return { userId: null, failure: 'no_token' };
  const hash = hashApiToken(match[1]);
  const { data } = await service
    .from('api_tokens')
    .select('id, user_id')
    .eq('token_hash', hash)
    .maybeSingle();
  if (!data) return { userId: null, failure: 'unknown_token' };
  // Awaited on purpose: supabase-js queries only execute when awaited,
  // so a fire-and-forget version of this never ran at all. Failures are
  // ignored — a stale timestamp must not block a save.
  await service
    .from('api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);
  return { userId: data.user_id as string };
}
