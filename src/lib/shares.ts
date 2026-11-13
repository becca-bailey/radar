import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sharing from capture tools (the iOS Shortcut today). The Shortcut can't
 * hold ids, so it shows a menu of labels and sends the picked label back;
 * both sides derive labels with shareChoices, so they always agree.
 */

export const JUST_SAVE = 'Just save';

export interface GroupOption {
  id: string;
  name: string;
}

export interface ShareChoice {
  label: string;
  /** null for "Just save". */
  groupId: string | null;
}

/**
 * The menu: "Just save" first (one tap keeps it private), then the
 * last-used group, then the rest by name. Labels are unique: a repeated
 * name (or a group called "Just save") gets " (2)", " (3)", …
 */
export function shareChoices(groups: GroupOption[], lastUsedId: string | null = null): ShareChoice[] {
  const ordered = [...groups].sort((a, b) => {
    if (a.id === lastUsedId) return -1;
    if (b.id === lastUsedId) return 1;
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  });
  const choices: ShareChoice[] = [{ label: JUST_SAVE, groupId: null }];
  const taken = new Set([JUST_SAVE.toLowerCase()]);
  for (const g of ordered) {
    const base = g.name.replace(/\s+/g, ' ').trim() || 'Untitled group';
    let label = base;
    for (let n = 2; taken.has(label.toLowerCase()); n++) label = `${base} (${n})`;
    taken.add(label.toLowerCase());
    choices.push({ label, groupId: g.id });
  }
  return choices;
}

/** The group for a picked label; null for "Just save" or an unknown label. */
export function resolveShareChoice(
  label: string,
  groups: GroupOption[],
  lastUsedId: string | null = null
): ShareChoice | null {
  const wanted = label.trim().toLowerCase();
  return shareChoices(groups, lastUsedId).find((c) => c.label.toLowerCase() === wanted) ?? null;
}

/** A user's groups and last-used group, read with the service client. */
export async function groupsForUser(
  service: SupabaseClient,
  userId: string
): Promise<{ groups: GroupOption[]; lastUsedId: string | null }> {
  const [{ data: rows }, { data: profile }] = await Promise.all([
    service.from('memberships').select('groups(id, name)').eq('user_id', userId),
    service.from('profiles').select('last_shared_group_id').eq('id', userId).maybeSingle(),
  ]);
  const groups = ((rows ?? []) as unknown as { groups: GroupOption | null }[])
    .map((r) => r.groups)
    .filter((g): g is GroupOption => !!g);
  return { groups, lastUsedId: (profile?.last_shared_group_id as string | null) ?? null };
}

export type ShareOutcome = 'shared' | 'already' | 'removed' | 'failed';

/**
 * Share a save to a group on a token-authenticated request. The service
 * client bypasses RLS, so this repeats its checks: the caller resolved
 * the group from their own memberships, and links the owner removed from
 * the group are refused.
 */
export async function shareSaveAsService(
  service: SupabaseClient,
  userId: string,
  saveId: string,
  groupId: string
): Promise<ShareOutcome> {
  const { data: removed } = await service.rpc('link_removed_from_group', { gid: groupId, sid: saveId });
  if (removed) return 'removed';
  const { error } = await service.from('shares').insert({ save_id: saveId, group_id: groupId });
  if (error) return error.code === '23505' ? 'already' : 'failed';
  await service.from('profiles').update({ last_shared_group_id: groupId }).eq('id', userId);
  return 'shared';
}
