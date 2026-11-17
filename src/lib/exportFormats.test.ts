import { describe, expect, it } from 'vitest';
import { joinNotes, saveDisplayTitle, toCsv, toHtmlList, toJson, toMarkdownList, type ExportItem } from './exportFormats';

const item = (over: Partial<ExportItem>): ExportItem => ({
  title: 'T',
  url: 'https://x.test/',
  source: null,
  note: null,
  savedAt: '2026-11-01T12:00:00.000Z',
  ...over,
});

describe('toMarkdownList', () => {
  it('renders one list line per save with source and note', () => {
    const md = toMarkdownList([
      item({ title: 'Sock heels, explained', url: 'https://example.com/heels', source: 'Knit Weekly', note: 'Finally makes sense' }),
      item({ title: 'No extras', url: 'https://example.org/a' }),
    ]);
    expect(md).toBe(
      '- [Sock heels, explained](https://example.com/heels) (Knit Weekly) — Finally makes sense\n' +
        '- [No extras](https://example.org/a)\n'
    );
  });

  it('escapes brackets in titles and parentheses in URLs', () => {
    const md = toMarkdownList([item({ title: 'A [draft] *thing*', url: 'https://en.wikipedia.org/wiki/Cable_(knitting)' })]);
    expect(md).toBe('- [A \\[draft\\] \\*thing\\*](https://en.wikipedia.org/wiki/Cable_%28knitting%29)\n');
  });

  it('flattens multi-line notes and ignores blank ones', () => {
    const md = toMarkdownList([item({ note: 'line one\n\nline two' }), item({ title: 'U', note: '   ' })]);
    expect(md).toBe('- [T](https://x.test/) — line one line two\n- [U](https://x.test/)\n');
  });

  it('returns an empty string for no saves', () => {
    expect(toMarkdownList([])).toBe('');
  });
});

describe('toHtmlList', () => {
  it('renders an escaped list', () => {
    const html = toHtmlList([item({ title: 'Fish & <chips>', url: 'https://x.test/?a=1&b="2"', source: 'Src', note: 'so good' })]);
    expect(html).toBe(
      '<ul><li><a href="https://x.test/?a=1&amp;b=&quot;2&quot;">Fish &amp; &lt;chips&gt;</a> (Src) — so good</li></ul>'
    );
  });

  it('returns an empty string for no saves', () => {
    expect(toHtmlList([])).toBe('');
  });
});

describe('toCsv', () => {
  it('writes a header and quotes cells that need it', () => {
    const csv = toCsv([item({ title: 'Say "hi", world', source: 'Src', note: 'two\nlines' })]);
    expect(csv).toBe(
      'saved_at,title,url,source,note,own_work\r\n' +
        '2026-11-01T12:00:00.000Z,"Say ""hi"", world",https://x.test/,Src,"two\nlines",false\r\n'
    );
  });

  it('defuses cells a spreadsheet would run as formulas', () => {
    const csv = toCsv([item({ title: '=HYPERLINK("x")' })]);
    expect(csv.split('\r\n')[1]).toBe(`2026-11-01T12:00:00.000Z,"'=HYPERLINK(""x"")",https://x.test/,,,false`);
  });
});

describe('toJson', () => {
  it('wraps the saves with a count and timestamp', () => {
    const parsed = JSON.parse(toJson([item({ source: 'Src' })], new Date('2026-11-14T00:00:00Z')));
    expect(parsed).toEqual({
      exported_at: '2026-11-14T00:00:00.000Z',
      count: 1,
      saves: [{ saved_at: '2026-11-01T12:00:00.000Z', title: 'T', url: 'https://x.test/', source: 'Src', note: null, own_work: false }],
    });
  });
});

describe('saveDisplayTitle', () => {
  it('prefers the page title, else host and path', () => {
    expect(saveDisplayTitle('Hello', 'https://www.example.com/a')).toBe('Hello');
    expect(saveDisplayTitle(null, 'https://www.example.com/a/b')).toBe('example.com/a/b');
    expect(saveDisplayTitle(null, 'not a url')).toBe('not a url');
  });
});

describe('group exports', () => {
  const shared = [
    item({ title: 'Sock heels', url: 'https://example.com/heels', source: 'Knit Weekly', note: 'Clear / Finally', ownWork: false, savedBy: 3 }),
    item({ title: 'My pattern', url: 'https://example.net/mine', note: 'I made this one', ownWork: true, savedBy: null }),
    item({ title: 'Solo', url: 'https://example.org/a', ownWork: false, savedBy: null }),
  ];
  const recommendationsOnly = shared.filter((i) => !i.ownWork);

  it('joins notes, dropping blanks and flattening whitespace', () => {
    expect(joinNotes(['Clear', '  ', 'Finally\nmakes sense'])).toBe('Clear / Finally makes sense');
    expect(joinNotes(['', ' '])).toBeNull();
  });

  it('says how many people saved a link, never who, and puts member work under its own heading', () => {
    expect(toMarkdownList(shared)).toBe(
      '- [Sock heels](https://example.com/heels) (Knit Weekly · saved by 3) — Clear / Finally\n' +
        '- [Solo](https://example.org/a)\n' +
        '\n## From our members\n\n' +
        '- [My pattern](https://example.net/mine) — I made this one\n'
    );
    expect(toHtmlList(shared)).toBe(
      '<ul><li><a href="https://example.com/heels">Sock heels</a> (Knit Weekly · saved by 3) — Clear / Finally</li>' +
        '<li><a href="https://example.org/a">Solo</a></li></ul>' +
        '<h2>From our members</h2>' +
        '<ul><li><a href="https://example.net/mine">My pattern</a> — I made this one</li></ul>'
    );
  });

  it('leaves the heading out when there is no member work', () => {
    expect(toMarkdownList(recommendationsOnly)).not.toContain('From our members');
    expect(toHtmlList(recommendationsOnly)).not.toContain('From our members');
  });

  it('starts with the heading when there is only member work', () => {
    const mine = shared.filter((i) => i.ownWork);
    expect(toMarkdownList(mine)).toBe('## From our members\n\n- [My pattern](https://example.net/mine) — I made this one\n');
  });

  it('adds saved_by and section columns to CSV, member work last', () => {
    const lines = toCsv(shared).split('\r\n');
    expect(lines[0]).toBe('last_shared_at,title,url,source,notes,saved_by,section');
    expect(lines[1]).toMatch(/,Sock heels,.*,3,recommended$/);
    expect(lines[2]).toMatch(/,Solo,.*,,recommended$/);
    expect(lines[3]).toMatch(/,My pattern,.*,,members$/);
  });

  it('splits member work into from_our_members in JSON', () => {
    const json = JSON.parse(toJson(shared, new Date('2026-11-16T00:00:00Z')));
    expect(json.count).toBe(3);
    expect(json.links).toHaveLength(2);
    expect(json.links[0]).toMatchObject({ title: 'Sock heels', notes: 'Clear / Finally', saved_by: 3 });
    expect(json.links[1].saved_by).toBeNull();
    expect(json.from_our_members).toEqual([expect.objectContaining({ title: 'My pattern', saved_by: null })]);
    expect(json.links[0].shared_by).toBeUndefined();
    expect(json.saves).toBeUndefined();
  });
});

describe('personal exports', () => {
  const mine = [
    item({ title: 'My essay', url: 'https://example.net/essay', ownWork: true }),
    item({ title: 'Read later', url: 'https://example.org/b', note: 'Good one', ownWork: false }),
  ];

  it('puts your own work last, under "My own work"', () => {
    expect(toMarkdownList(mine)).toBe(
      '- [Read later](https://example.org/b) — Good one\n\n## My own work\n\n- [My essay](https://example.net/essay)\n'
    );
    expect(toHtmlList(mine)).toContain('</ul><h2>My own work</h2><ul>');
  });

  it('adds own_work to CSV and JSON, and stays a personal export', () => {
    const lines = toCsv(mine).split('\r\n');
    expect(lines[0]).toBe('saved_at,title,url,source,note,own_work');
    expect(lines[1]).toMatch(/,Read later,.*,false$/);
    expect(lines[2]).toMatch(/,My essay,.*,true$/);
    const json = JSON.parse(toJson(mine, new Date('2026-11-16T00:00:00Z')));
    expect(json.links).toBeUndefined();
    expect(json.saves.map((s: { title: string; own_work: boolean }) => [s.title, s.own_work])).toEqual([
      ['Read later', false],
      ['My essay', true],
    ]);
  });
});
