import { describe, expect, it } from 'vitest';
import { agoLabel, pickForDay } from './resurface';

describe('pickForDay', () => {
  it('is stable for a day and handles empty lists', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(pickForDay(items, '2026-11-17')).toBe(pickForDay(items, '2026-11-17'));
    expect(pickForDay([], '2026-11-17')).toBeNull();
  });

  it('moves around over a week', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const picks = new Set(['10', '11', '12', '13', '14', '15', '16'].map((d) => pickForDay(items, `2026-11-${d}`)));
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('agoLabel', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  it('counts whole months, then years', () => {
    expect(agoLabel(new Date('2026-10-10T00:00:00Z'), now)).toBe('a month ago');
    expect(agoLabel(new Date('2026-06-20T00:00:00Z'), now)).toBe('4 months ago');
    expect(agoLabel(new Date('2025-11-01T00:00:00Z'), now)).toBe('a year ago');
    expect(agoLabel(new Date('2023-01-01T00:00:00Z'), now)).toBe('3 years ago');
  });
});
