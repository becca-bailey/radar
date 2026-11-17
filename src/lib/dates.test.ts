import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  dayKey,
  formatDate,
  formatRecentDate,
  formatWeekLabel,
  isDayKey,
  isValidTimeZone,
  localDayRange,
  localWeekRange,
  mondayOf,
  resolveTimeZone,
  weekStartKey,
} from './dates';

const LA = 'America/Los_Angeles';

describe('isValidTimeZone / resolveTimeZone', () => {
  it('accepts IANA zones and rejects junk', () => {
    expect(isValidTimeZone(LA)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Bogus/Zone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone('x'.repeat(100))).toBe(false);
  });

  it('takes the first valid candidate, else UTC', () => {
    expect(resolveTimeZone('Bogus/Zone', LA)).toBe(LA);
    expect(resolveTimeZone(undefined, null)).toBe('UTC');
    expect(resolveTimeZone('Asia/Tokyo', LA)).toBe('Asia/Tokyo');
  });
});

describe('formatDate', () => {
  it('shows an evening Pacific save on its local day', () => {
    // 7pm on Nov 13 in Los Angeles.
    expect(formatDate('2026-11-14T03:00:00Z', LA)).toBe('Nov 13, 2026');
    expect(formatDate('2026-11-14T03:00:00Z', 'UTC')).toBe('Nov 14, 2026');
    expect(formatDate('2026-11-14T03:00:00Z', 'Asia/Tokyo', { year: false })).toBe('Nov 14');
  });
});

describe('formatRecentDate', () => {
  // 9am Nov 14 in Los Angeles.
  const now = new Date('2026-11-14T17:00:00Z');

  it('says Today and Yesterday by local calendar day', () => {
    expect(formatRecentDate('2026-11-14T08:30:00Z', LA, now)).toBe('Today'); // 12:30am Nov 14
    expect(formatRecentDate('2026-11-14T07:30:00Z', LA, now)).toBe('Yesterday'); // 11:30pm Nov 13
    expect(formatRecentDate('2026-11-13T08:30:00Z', LA, now)).toBe('Yesterday'); // 12:30am Nov 13
    expect(formatRecentDate('2026-11-13T07:30:00Z', LA, now)).toBe('Nov 12, 2026');
  });

  it('depends on the zone', () => {
    // 11:30pm Nov 13 in LA is already Nov 14 in UTC.
    expect(formatRecentDate('2026-11-14T07:30:00Z', 'UTC', now)).toBe('Today');
  });

  it('can drop the year', () => {
    expect(formatRecentDate('2026-11-01T12:00:00Z', LA, now, { year: false })).toBe('Nov 1');
  });
});

describe('dayKey', () => {
  it('is the local calendar day', () => {
    expect(dayKey('2026-11-14T03:00:00Z', LA)).toBe('2026-11-13');
    expect(dayKey('2026-11-14T03:00:00Z', 'UTC')).toBe('2026-11-14');
  });
});

describe('isDayKey', () => {
  it('accepts real calendar days only', () => {
    expect(isDayKey('2026-11-13')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('0050-01-01')).toBe(false);
    expect(isDayKey('2026-11-13T00:00')).toBe(false);
    expect(isDayKey(null)).toBe(false);
  });
});

describe('localDayRange', () => {
  it('turns a local day into UTC instants', () => {
    expect(localDayRange('2026-11-13', LA)).toEqual({
      start: '2026-11-13T08:00:00.000Z',
      end: '2026-11-14T08:00:00.000Z',
    });
    expect(localDayRange('2026-11-13', 'UTC')).toEqual({
      start: '2026-11-13T00:00:00.000Z',
      end: '2026-11-14T00:00:00.000Z',
    });
  });

  it('follows DST: the fall-back day is 25 hours', () => {
    const { start, end } = localDayRange('2026-11-01', LA);
    expect(start).toBe('2026-11-01T07:00:00.000Z');
    expect(end).toBe('2026-11-02T08:00:00.000Z');
  });

  it('handles month and year ends', () => {
    expect(localDayRange('2026-12-31', 'Asia/Tokyo')).toEqual({
      start: '2026-12-30T15:00:00.000Z',
      end: '2026-12-31T15:00:00.000Z',
    });
  });
});

describe('addDaysToKey', () => {
  it('crosses months, years and leap days', () => {
    expect(addDaysToKey('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysToKey('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDaysToKey('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDaysToKey('2026-11-02', -7)).toBe('2026-10-26');
  });
});

describe('mondayOf / weekStartKey', () => {
  it('runs weeks Monday to Sunday', () => {
    expect(mondayOf('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(mondayOf('2026-11-17')).toBe('2026-11-16'); // Tuesday
    expect(mondayOf('2026-11-22')).toBe('2026-11-16'); // Sunday
    expect(mondayOf('2026-11-23')).toBe('2026-11-23'); // next Monday
    expect(mondayOf('2027-01-01')).toBe('2026-12-28'); // across the year
  });

  it('uses the local day of the instant', () => {
    // 11pm Sunday Nov 15 in Los Angeles is Monday Nov 16 in UTC.
    expect(weekStartKey('2026-11-16T07:00:00Z', LA)).toBe('2026-11-09');
    expect(weekStartKey('2026-11-16T07:00:00Z', 'UTC')).toBe('2026-11-16');
  });
});

describe('localWeekRange', () => {
  it('spans Monday midnight to the next Monday midnight, locally', () => {
    expect(localWeekRange('2026-11-09', LA)).toEqual({
      start: '2026-11-09T08:00:00.000Z',
      end: '2026-11-16T08:00:00.000Z',
    });
  });

  it('follows DST: the fall-back week is an hour longer', () => {
    expect(localWeekRange('2026-10-26', LA)).toEqual({
      start: '2026-10-26T07:00:00.000Z',
      end: '2026-11-02T08:00:00.000Z',
    });
  });

  it('meets the next week with no gap', () => {
    expect(localWeekRange('2026-10-26', LA).end).toBe(localWeekRange('2026-11-02', LA).start);
  });
});

describe('formatWeekLabel', () => {
  it('shortens what the two ends share', () => {
    expect(formatWeekLabel('2026-11-09')).toBe('Nov 9 – 15, 2026');
    expect(formatWeekLabel('2026-11-30')).toBe('Nov 30 – Dec 6, 2026');
    expect(formatWeekLabel('2026-12-28')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
});
