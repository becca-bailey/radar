import { describe, expect, it } from 'vitest';
import { inviteState, joinToken, membershipStatus, type InviteLinkRow } from './inviteLinks';

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
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  it('shows members and this week’s joins when open', () => {
    expect(membershipStatus(4, link({ uses_this_week: 2 }), fmt, now)).toBe('4 members · Open · 2 joined this week');
  });

  it('uses the singular for one member', () => {
    expect(membershipStatus(1, link(), fmt, now)).toBe('1 member · Open · 0 joined this week');
  });

  it('says when a paused link reopens and what the limit is', () => {
    expect(membershipStatus(5, link({ uses_this_week: 3 }), fmt, now)).toBe(
      "5 members · Paused until 2026-11-19: reached this week's limit of 3"
    );
  });

  it('counts from zero once the week has rolled over', () => {
    const old = link({ uses_this_week: 3, week_started_at: '2026-11-01T00:00:00Z' });
    expect(membershipStatus(5, old, fmt, now)).toBe('5 members · Open · 0 joined this week');
  });

  it('leaves out the member count when it is unknown', () => {
    expect(membershipStatus(null, link(), fmt, now)).toBe('Open · 0 joined this week');
  });
});
