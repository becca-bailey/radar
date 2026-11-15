import type { SupabaseClient } from '@supabase/supabase-js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface InviteLinkRow {
  id: string;
  group_id: string;
  active: boolean;
  weekly_cap: number;
  uses_this_week: number;
  week_started_at: string;
  paused_at: string | null;
  groups?: { name: string } | null;
}

export type InviteState =
  /** Usable: joins (and sign-ups) are allowed. `uses` is this week's count after any rollover. */
  | { status: 'open'; uses: number; rolledOver: boolean }
  /** Hit its weekly cap. */
  | { status: 'paused'; uses: number; rolledOver: boolean }
  /** No such link, or it was rotated or switched off. */
  | { status: 'dead' };

/**
 * Where an invite link stands right now. Pure: the weekly window rolls over
 * after seven days, and a link at its cap is paused until then.
 */
export function inviteState(invite: InviteLinkRow | null, now: Date = new Date()): InviteState {
  if (!invite || !invite.active) return { status: 'dead' };
  const rolledOver = now.getTime() - new Date(invite.week_started_at).getTime() > WEEK_MS;
  const uses = rolledOver ? 0 : invite.uses_this_week;
  return { status: uses >= invite.weekly_cap ? 'paused' : 'open', uses, rolledOver };
}

/** The invite token in a `/join/<token>` path, or null. */
export function joinToken(path: string | null | undefined): string | null {
  const m = /^\/join\/([A-Za-z0-9_-]{8,128})\/?$/.exec(path ?? '');
  return m ? m[1] : null;
}

/** Look up an invite link by token (service role: tokens are secrets, not RLS-visible). */
export async function findInviteLink(service: SupabaseClient, token: string): Promise<InviteLinkRow | null> {
  const { data } = await service
    .from('invite_links')
    .select('id, group_id, active, weekly_cap, uses_this_week, week_started_at, paused_at, groups(name)')
    .eq('token', token)
    .maybeSingle();
  return (data as unknown as InviteLinkRow | null) ?? null;
}

const INVITE_COLUMNS = 'id, group_id, token, active, weekly_cap, uses_this_week, week_started_at, paused_at';

export type OwnerInviteLink = InviteLinkRow & { token: string };

/**
 * The group's active invite link, created if there isn't one, so an owner
 * always has a link to hand out. Service role, like rotation. Two page loads
 * racing to create one trip `invite_links_one_active_idx`; the loser re-reads
 * the winner's row.
 */
export async function ensureInviteLink(service: SupabaseClient, groupId: string): Promise<OwnerInviteLink | null> {
  const readActive = async () => {
    const { data } = await service
      .from('invite_links')
      .select(INVITE_COLUMNS)
      .eq('group_id', groupId)
      .eq('active', true)
      .maybeSingle();
    return (data as OwnerInviteLink | null) ?? null;
  };
  const existing = await readActive();
  if (existing) return existing;
  const { data, error } = await service.from('invite_links').insert({ group_id: groupId }).select(INVITE_COLUMNS).single();
  if (!error) return data as OwnerInviteLink;
  return error.code === '23505' ? readActive() : null;
}

/**
 * The owner's one-line summary of the group: "3 members · 2 joined this week".
 * The weekly count restarts when the link's seven-day window rolls over.
 */
export function membershipStatus(memberCount: number | null, invite: InviteLinkRow, now: Date = new Date()): string {
  const state = inviteState(invite, now);
  const parts: string[] = [];
  if (memberCount !== null) parts.push(`${memberCount} ${memberCount === 1 ? 'member' : 'members'}`);
  if (state.status !== 'dead') parts.push(`${state.uses} joined this week`);
  return parts.join(' · ');
}
