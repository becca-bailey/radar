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

describe('the Shortcut\'s Options list', () => {
  it('puts "I made this" first, then "Share to" each group, even with no groups', () => {
    expect(shortcutMenu(groups, 'g-r')).toEqual([
      OWN_WORK_LABEL,
      'Share to Readers',
      'Share to Allotment',
      'Share to Bakers',
    ]);
    expect(shortcutMenu([])).toEqual([OWN_WORK_LABEL]);
  });

  it('resolves "Share to" items and bare labels to the same group', () => {
    expect(resolveShareChoice('Share to Readers', groups)?.groupId).toBe('g-r');
    expect(resolveShareChoice(' share to readers ', groups)?.groupId).toBe('g-r');
    expect(resolveShareChoice('Readers', groups)?.groupId).toBe('g-r');
    expect(resolveShareChoice('Share to Knitters', groups)).toBeNull();
  });

  it('reaches groups whose names collide with the prefix or the own-work item', () => {
    const odd = [
      { id: 'g-1', name: 'Readers' },
      { id: 'g-2', name: 'Share to Readers' },
      { id: 'g-3', name: OWN_WORK_LABEL },
    ];
    const menu = shortcutMenu(odd);
    expect(menu).toContain('Share to Share to Readers');
    expect(menu).toContain(`Share to ${OWN_WORK_LABEL}`);
    const ids = menu.slice(1).map((label) => resolveShareChoice(label, odd)?.groupId).sort();
    expect(ids).toEqual(['g-1', 'g-2', 'g-3']);
  });

  it('reads "I made this" out of share_to, leaving only group items', () => {
    expect(splitOwnWork([OWN_WORK_LABEL, 'Share to Readers'])).toEqual({ ownWork: true, groupLabels: ['Share to Readers'] });
    expect(splitOwnWork([' ★ i made this '])).toEqual({ ownWork: true, groupLabels: [] });
    expect(splitOwnWork(['Readers'])).toEqual({ ownWork: false, groupLabels: ['Readers'] });
    expect(splitOwnWork([`Share to ${OWN_WORK_LABEL}`])).toEqual({ ownWork: false, groupLabels: [`Share to ${OWN_WORK_LABEL}`] });
    expect(splitOwnWork(parseShareTo(`${OWN_WORK_LABEL}\nShare to Bakers`))).toEqual({
      ownWork: true,
      groupLabels: ['Share to Bakers'],
    });
  });
});
