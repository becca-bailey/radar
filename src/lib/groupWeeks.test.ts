import { describe, expect, it } from 'vitest';
import { resolveWeek, weekPaging, weekPath } from './groupWeeks';

const firstWeek = '2026-10-05';
const currentWeek = '2026-11-16';

describe('resolveWeek', () => {
  it('names a week by its Monday', () => {
    expect(resolveWeek('2026-11-12', firstWeek, currentWeek)).toBe('2026-11-09');
    expect(resolveWeek('2026-11-09', firstWeek, currentWeek)).toBe('2026-11-09');
  });

  it('defaults to this week for a missing or bad date', () => {
    expect(resolveWeek(null, firstWeek, currentWeek)).toBe(currentWeek);
    expect(resolveWeek('last-week', firstWeek, currentWeek)).toBe(currentWeek);
    expect(resolveWeek('2026-02-30', firstWeek, currentWeek)).toBe(currentWeek);
  });

  it('clamps to the weeks the group has existed', () => {
    expect(resolveWeek('2027-01-01', firstWeek, currentWeek)).toBe(currentWeek);
    expect(resolveWeek('2026-01-01', firstWeek, currentWeek)).toBe(firstWeek);
  });
});

describe('weekPaging', () => {
  it('has no Later link on this week', () => {
    expect(weekPaging(currentWeek, { firstWeek, currentWeek, latestBefore: '2026-11-09' })).toEqual({
      earlier: '2026-11-09',
      later: null,
      skipTo: null,
    });
  });

  it('has no Earlier link on the group’s first week', () => {
    expect(weekPaging(firstWeek, { firstWeek, currentWeek, latestBefore: null })).toEqual({
      earlier: null,
      later: '2026-10-12',
      skipTo: null,
    });
  });

  it('has no Earlier link when nothing was shared before', () => {
    expect(weekPaging('2026-11-02', { firstWeek, currentWeek, latestBefore: null }).earlier).toBeNull();
  });

  it('falls back to the first week when the lookup failed', () => {
    expect(weekPaging('2026-11-02', { firstWeek, currentWeek, latestBefore: undefined })).toEqual({
      earlier: '2026-10-26',
      later: '2026-11-09',
      skipTo: null,
    });
  });

  it('offers a skip past empty weeks', () => {
    expect(weekPaging('2026-11-09', { firstWeek, currentWeek, latestBefore: '2026-10-19' })).toEqual({
      earlier: '2026-11-02',
      later: '2026-11-16',
      skipTo: '2026-10-19',
    });
  });
});

describe('weekPath', () => {
  it('builds the week URL', () => {
    expect(weekPath('/groups/abc', '2026-11-09')).toBe('/groups/abc/week?of=2026-11-09');
  });
});
