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

/**
 * Resolve a Bearer token to a user id, or null. Uses the service client
 * (token lookup happens before any user is known).
 */
export async function userIdForBearerToken(
  service: SupabaseClient,
  authorizationHeader: string | null
): Promise<string | null> {
  // rdr_ is current; rh_ tokens from before the rename keep working.
  const match = authorizationHeader?.match(/^Bearer\s+((?:rdr|rh)_[A-Za-z0-9_-]+)$/);
  if (!match) return null;
  const hash = hashApiToken(match[1]);
  const { data } = await service
    .from('api_tokens')
    .select('id, user_id')
    .eq('token_hash', hash)
    .maybeSingle();
  if (!data) return null;
  // Fire-and-forget usage timestamp.
  void service.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data.user_id as string;
}
