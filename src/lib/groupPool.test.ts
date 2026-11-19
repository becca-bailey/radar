import { describe, expect, it } from 'vitest';
import { pageOf, parsePage, savedByLabel, sharedByLabel } from './groupPool';

describe('sharedByLabel', () => {
  it('counts anonymous sharers and names the ones with a nickname', () => {
    expect(sharedByLabel(1, [])).toBe('');
    expect(sharedByLabel(3, [])).toBe('shared by 3');
    expect(sharedByLabel(1, ['Ana'])).toBe('shared by Ana');
    expect(sharedByLabel(2, ['Ana', 'Bo'])).toBe('shared by Ana and Bo');
    expect(sharedByLabel(3, ['Ana'])).toBe('shared by Ana and 2 others');
    expect(sharedByLabel(4, ['Ana', 'Bo', 'Cy'])).toBe('shared by Ana, Bo and 2 others');
  });
});

describe('savedByLabel', () => {
  it('shows the Radar-wide count from two savers up', () => {
    expect(savedByLabel(null)).toBe('');
    expect(savedByLabel(undefined)).toBe('');
    expect(savedByLabel(1)).toBe('');
    expect(savedByLabel(2)).toBe('saved by 2');
    expect(savedByLabel(15)).toBe('saved by 15');
  });
});

describe('parsePage', () => {
  it('reads a page number', () => {
    expect(parsePage('3', 50)).toBe(3);
    expect(parsePage('50', 50)).toBe(50);
  });

  it('falls back to page 1', () => {
    expect(parsePage(null, 50)).toBe(1);
    expect(parsePage('0', 50)).toBe(1);
    expect(parsePage('-2', 50)).toBe(1);
    expect(parsePage('2.5', 50)).toBe(1);
    expect(parsePage('two', 50)).toBe(1);
  });

  it('stops at the last page', () => {
    expect(parsePage('51', 50)).toBe(50);
    expect(parsePage('999999', 50)).toBe(50);
  });
});

describe('pageOf', () => {
  const rows = Array.from({ length: 7 }, (_, i) => i);

  it('slices a page and says whether an older one exists', () => {
    expect(pageOf(rows, 1, 3)).toEqual({ items: [0, 1, 2], hasOlder: true });
    expect(pageOf(rows, 2, 3)).toEqual({ items: [3, 4, 5], hasOlder: true });
    expect(pageOf(rows, 3, 3)).toEqual({ items: [6], hasOlder: false });
  });

  it('has no older page when the rows end exactly at the page', () => {
    expect(pageOf(rows.slice(0, 6), 2, 3)).toEqual({ items: [3, 4, 5], hasOlder: false });
  });

  it('is empty past the end', () => {
    expect(pageOf(rows, 4, 3)).toEqual({ items: [], hasOlder: false });
  });
});
