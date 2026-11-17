import { describe, expect, it } from 'vitest';
import {
  MAX_SHARE_TO,
  OWN_WORK_LABEL,
  parseShareTo,
  resolveShareChoice,
  shareChoices,
  shareSummary,
  shortcutMenu,
  splitOwnWork,
} from './shares';

const groups = [
  { id: 'g-b', name: 'Bakers' },
  { id: 'g-r', name: 'Readers' },
  { id: 'g-a', name: 'Allotment' },
];

describe('shareChoices', () => {
  it('puts the last-used group first, then the rest by name', () => {
    expect(shareChoices(groups, 'g-r').map((c) => c.label)).toEqual(['Readers', 'Allotment', 'Bakers']);
    expect(shareChoices(groups).map((c) => c.label)).toEqual(['Allotment', 'Bakers', 'Readers']);
  });

  it('is empty with no groups', () => {
    expect(shareChoices([])).toEqual([]);
  });

  it('keeps labels unique', () => {
    const labels = shareChoices([
      { id: '1', name: 'Readers' },
      { id: '2', name: 'readers ' },
    ]).map((c) => c.label);
    expect(labels).toEqual(['Readers', 'readers (2)']);
  });
});

describe('resolveShareChoice', () => {
  it('maps a label back to its group, ignoring case and spaces', () => {
    expect(resolveShareChoice(' readers ', groups)?.groupId).toBe('g-r');
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

  it('drops blanks and repeats', () => {
    expect(parseShareTo('\n Readers \nreaders\n\nBakers\n')).toEqual(['Readers', 'Bakers']);
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

describe('"I made this" in the Shortcut list', () => {
  it('comes first, before the groups, even with no groups', () => {
    expect(shortcutMenu(groups, 'g-r')).toEqual([OWN_WORK_LABEL, 'Readers', 'Allotment', 'Bakers']);
    expect(shortcutMenu([])).toEqual([OWN_WORK_LABEL]);
  });

  it('never lets a group take its label', () => {
    const labels = shortcutMenu([{ id: 'g-x', name: OWN_WORK_LABEL }]);
    expect(labels).toEqual([OWN_WORK_LABEL, `${OWN_WORK_LABEL} (2)`]);
    expect(resolveShareChoice(`${OWN_WORK_LABEL} (2)`, [{ id: 'g-x', name: OWN_WORK_LABEL }])?.groupId).toBe('g-x');
    expect(resolveShareChoice(OWN_WORK_LABEL, [{ id: 'g-x', name: OWN_WORK_LABEL }])).toBeNull();
  });

  it('is read out of share_to, leaving only group labels', () => {
    expect(splitOwnWork([OWN_WORK_LABEL, 'Readers'])).toEqual({ ownWork: true, groupLabels: ['Readers'] });
    expect(splitOwnWork([' ★ i made this '])).toEqual({ ownWork: true, groupLabels: [] });
    expect(splitOwnWork(['Readers'])).toEqual({ ownWork: false, groupLabels: ['Readers'] });
    expect(splitOwnWork(parseShareTo(`${OWN_WORK_LABEL}\nBakers`))).toEqual({ ownWork: true, groupLabels: ['Bakers'] });
  });
});
