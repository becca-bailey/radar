import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureInviteLink, inviteState, joinToken, membershipStatus, type InviteLinkRow } from './inviteLinks';

const now = new Date('2026-11-14T12:00:00Z');
const link = (over: Partial<InviteLinkRow> = {}): InviteLinkRow => ({
  id: 'l1',
  group_id: 'g1',
  active: true,
  weekly_cap: 3,
  uses_this_week: 0,
  week_started_at: '2026-11-12T00:00:00Z',
  paused_at: null,
  ...over,
});

describe('inviteState', () => {
  it('is dead when missing or inactive', () => {
    expect(inviteState(null, now)).toEqual({ status: 'dead' });
    expect(inviteState(link({ active: false }), now)).toEqual({ status: 'dead' });
  });

  it('is open under the weekly cap', () => {
    expect(inviteState(link({ uses_this_week: 2 }), now)).toEqual({ status: 'open', uses: 2, rolledOver: false });
  });

  it('is paused at the cap', () => {
    expect(inviteState(link({ uses_this_week: 3 }), now)).toMatchObject({ status: 'paused', uses: 3 });
  });

  it('reopens once the week has rolled over', () => {
    const old = link({ uses_this_week: 3, week_started_at: '2026-11-01T00:00:00Z' });
    expect(inviteState(old, now)).toEqual({ status: 'open', uses: 0, rolledOver: true });
  });
});

describe('joinToken', () => {
  it('reads the token from a join path', () => {
    expect(joinToken('/join/abc123def456')).toBe('abc123def456');
    expect(joinToken('/join/abc123def456/')).toBe('abc123def456');
  });

  it('ignores anything else', () => {
    expect(joinToken(null)).toBeNull();
    expect(joinToken('/')).toBeNull();
    expect(joinToken('/join/')).toBeNull();
    expect(joinToken('/join/short')).toBeNull();
    expect(joinToken('/join/abc123def456?x=1')).toBeNull();
    expect(joinToken('/groups/abc123def456')).toBeNull();
    expect(joinToken('/join/abc123def456/../admin')).toBeNull();
  });
});

describe('membershipStatus', () => {
  it('shows members and this week’s joins', () => {
    expect(membershipStatus(4, link({ uses_this_week: 2 }), now)).toBe('4 members · 2 joined this week');
  });

  it('uses the singular for one member', () => {
    expect(membershipStatus(1, link(), now)).toBe('1 member · 0 joined this week');
  });

  it('counts from zero once the week has rolled over', () => {
    const old = link({ uses_this_week: 3, week_started_at: '2026-11-01T00:00:00Z' });
    expect(membershipStatus(5, old, now)).toBe('5 members · 0 joined this week');
  });

  it('leaves out the member count when it is unknown', () => {
    expect(membershipStatus(null, link(), now)).toBe('0 joined this week');
  });
});

describe('ensureInviteLink', () => {
  const row = { ...link(), token: 'tok' };

  /** A stand-in for the service client: queued results for reads and inserts. */
  const fakeClient = (reads: unknown[], insert: { data: unknown; error: { code: string } | null }) => {
    const inserted: unknown[] = [];
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: reads.shift() ?? null }),
      insert: (values: unknown) => {
        inserted.push(values);
        return { select: () => ({ single: async () => insert }) };
      },
    };
    return { client: { from: () => query } as unknown as SupabaseClient, inserted };
  };

  it('returns the active link without inserting', async () => {
    const { client, inserted } = fakeClient([row], { data: null, error: null });
    expect(await ensureInviteLink(client, 'g1')).toBe(row);
    expect(inserted).toEqual([]);
  });

  it('creates a link when the group has none', async () => {
    const { client, inserted } = fakeClient([null], { data: row, error: null });
    expect(await ensureInviteLink(client, 'g1')).toBe(row);
    expect(inserted).toEqual([{ group_id: 'g1' }]);
  });

  it('re-reads the winner when another load created one first', async () => {
    const { client } = fakeClient([null, row], { data: null, error: { code: '23505' } });
    expect(await ensureInviteLink(client, 'g1')).toBe(row);
  });

  it('gives up on any other insert error', async () => {
    const { client } = fakeClient([null, row], { data: null, error: { code: '42501' } });
    expect(await ensureInviteLink(client, 'g1')).toBeNull();
  });
});
