import type { SupabaseClient } from '@supabase/supabase-js';
import { adminEmails } from './admin';

/** Lowercase and trim an email; null if it doesn't look like one. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * May this email create an account? Admins always can; everyone else needs
 * a row in beta_invites. Existing accounts sign in regardless — this only
 * gates creating new ones.
 */
export async function isInvited(service: SupabaseClient, email: string): Promise<boolean> {
  if (adminEmails().includes(email)) return true;
  const { data } = await service.from('beta_invites').select('email').eq('email', email).maybeSingle();
  return !!data;
}

/**
 * Create the account for an invited email if it doesn't exist yet.
 * Sign-ups are otherwise closed (signInWithOtp runs with
 * shouldCreateUser: false), so this is the only way new accounts appear.
 */
export async function ensureInvitedUser(service: SupabaseClient, email: string): Promise<void> {
  const { error } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (error && error.code !== 'email_exists' && !/already (been )?registered|already exists/i.test(error.message)) {
    throw new Error(error.message);
  }
}
