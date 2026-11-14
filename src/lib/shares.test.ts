import { describe, expect, it } from 'vitest';
import { JUST_SAVE, MAX_SHARE_TO, parseShareTo, resolveShareChoice, shareChoices, shareSummary } from './shares';

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

describe('parseShareTo', () => {
  it('splits one label per line, as the Shortcut sends a multi-select', () => {
    expect(parseShareTo('Readers\nBakers\r\nAllotment')).toEqual(['Readers', 'Bakers', 'Allotment']);
  });

  it('accepts a JSON array and ignores non-strings', () => {
    expect(parseShareTo(['Readers', 3, ' Bakers '])).toEqual(['Readers', 'Bakers']);
  });

  it('drops blanks, "Just save" and repeats', () => {
    expect(parseShareTo('\n just save \nReaders\nreaders\n\n')).toEqual(['Readers']);
    expect(parseShareTo(JUST_SAVE)).toEqual([]);
  });

  it('keeps at most MAX_SHARE_TO labels', () => {
    const many = Array.from({ length: MAX_SHARE_TO + 10 }, (_, i) => `G${i}`).join('\n');
    expect(parseShareTo(many)).toHaveLength(MAX_SHARE_TO);
  });

  it('is empty for nothing picked or a missing field', () => {
    expect(parseShareTo('')).toEqual([]);
    expect(parseShareTo(undefined)).toEqual([]);
    expect(parseShareTo(null)).toEqual([]);
  });
});

describe('shareSummary', () => {
  it('is empty when nothing was asked for', () => {
    expect(shareSummary([], [])).toBe('');
  });

  it('keeps the single-group wording', () => {
    expect(shareSummary([{ label: 'Readers', outcome: 'shared' }], [])).toBe(' and shared to Readers');
    expect(shareSummary([{ label: 'Readers', outcome: 'already' }], [])).toBe(' — already shared to Readers');
    expect(shareSummary([], ['Knitters'])).toBe(" — couldn't find the group “Knitters”");
  });

  it('lists several groups and every problem', () => {
    expect(
      shareSummary(
        [
          { label: 'Readers', outcome: 'shared' },
          { label: 'Bakers', outcome: 'shared' },
          { label: 'Allotment', outcome: 'shared' },
          { label: 'Chess', outcome: 'removed' },
          { label: 'Film', outcome: 'failed' },
        ],
        ['Knitters']
      )
    ).toBe(
      " and shared to Readers, Bakers and Allotment — not shared: Chess's owner removed this link; " +
        "couldn't share to Film, try from the archive; couldn't find the group “Knitters”"
    );
  });
});
