/**
 * Feature flags, env-driven. Groups (and the public Explore layer built on
 * them) ship dark until the personal archive stands on its own.
 */
export function groupsEnabled(): boolean {
  return import.meta.env.GROUPS_ENABLED === 'true';
}
