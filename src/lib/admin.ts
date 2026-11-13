import type { User } from '@supabase/supabase-js';

/** Emails listed in ADMIN_EMAILS (comma-separated), lowercased. */
export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? import.meta.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user: User | null | undefined): boolean {
  return !!user?.email && adminEmails().includes(user.email.toLowerCase());
}
