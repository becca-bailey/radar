import { describe, expect, it } from 'vitest';
import { JUST_SAVE, resolveShareChoice, shareChoices } from './shares';

const groups = [
  { id: 'g-b', name: 'Bakers' },
  { id: 'g-r', name: 'Readers' },
  { id: 'g-a', name: 'Allotment' },
];

describe('shareChoices', () => {
  it('puts Just save first, then the last-used group, then the rest by name', () => {
    expect(shareChoices(groups, 'g-r').map((c) => c.label)).toEqual([JUST_SAVE, 'Readers', 'Allotment', 'Bakers']);
    expect(shareChoices(groups).map((c) => c.label)).toEqual([JUST_SAVE, 'Allotment', 'Bakers', 'Readers']);
  });

  it('is just "Just save" with no groups', () => {
    expect(shareChoices([])).toEqual([{ label: JUST_SAVE, groupId: null }]);
  });

  it('keeps labels unique, including a group named "Just save"', () => {
    const labels = shareChoices([
      { id: '1', name: 'Readers' },
      { id: '2', name: 'readers ' },
      { id: '3', name: 'Just save' },
    ]).map((c) => c.label);
    expect(labels).toEqual([JUST_SAVE, 'Just save (2)', 'Readers', 'readers (2)']);
  });
});

describe('resolveShareChoice', () => {
  it('maps a label back to its group, ignoring case and spaces', () => {
    expect(resolveShareChoice(' readers ', groups)?.groupId).toBe('g-r');
    expect(resolveShareChoice(JUST_SAVE, groups)?.groupId).toBeNull();
  });

  it('returns null for a label that matches nothing', () => {
    expect(resolveShareChoice('Knitters', groups)).toBeNull();
  });
});
