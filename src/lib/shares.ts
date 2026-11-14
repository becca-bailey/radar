import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sharing from capture tools (the iOS Shortcut today). The Shortcut can't
 * hold ids, so it shows a menu of labels and sends the picked labels back;
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

/**
 * The labels in a `share_to` value, in order: a JSON array of labels, or
 * one string with a label per line (what the Shortcut sends when its
 * multi-select list lands in a text field). Blank lines, "Just save" and
 * repeats are dropped. Labels never contain newlines: shareChoices
 * collapses whitespace in group names.
 */
export function parseShareTo(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : typeof value === 'string'
      ? value.split(/\r?\n/)
      : [];
  const seen = new Set([JUST_SAVE.toLowerCase()]);
  const labels: string[] = [];
  for (const item of raw) {
    const label = item.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/** "A", "A and B", "A, B and C". */
function listOf(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * What to append to "Saved to Radar" after sharing to one or more groups,
 * e.g. " and shared to Readers and Bakers — couldn't find the group “Knitters”".
 * `outcomes` holds each found group's label and how sharing went;
 * `missing` holds labels that matched no group.
 */
export function shareSummary(outcomes: { label: string; outcome: ShareOutcome }[], missing: string[]): string {
  const by = (o: ShareOutcome) => outcomes.filter((x) => x.outcome === o).map((x) => x.label);
  const shared = by('shared');
  const already = by('already');
  const failed = by('failed');
  const problems: string[] = [];
  if (already.length) problems.push(`already shared to ${listOf(already)}`);
  for (const label of by('removed')) problems.push(`not shared: ${label}'s owner removed this link`);
  if (failed.length) problems.push(`couldn't share to ${listOf(failed)}, try from the archive`);
  if (missing.length) problems.push(`couldn't find ${listOf(missing.map((m) => `the group “${m}”`))}`);
  return (shared.length ? ` and shared to ${listOf(shared)}` : '') + (problems.length ? ` — ${problems.join('; ')}` : '');
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
