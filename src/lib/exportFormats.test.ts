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
      'saved_at,title,url,source,note\r\n' +
        '2026-11-01T12:00:00.000Z,"Say ""hi"", world",https://x.test/,Src,"two\nlines"\r\n'
    );
  });

  it('defuses cells a spreadsheet would run as formulas', () => {
    const csv = toCsv([item({ title: '=HYPERLINK("x")' })]);
    expect(csv.split('\r\n')[1]).toBe(`2026-11-01T12:00:00.000Z,"'=HYPERLINK(""x"")",https://x.test/,,`);
  });
});

describe('toJson', () => {
  it('wraps the saves with a count and timestamp', () => {
    const parsed = JSON.parse(toJson([item({ source: 'Src' })], new Date('2026-11-14T00:00:00Z')));
    expect(parsed).toEqual({
      exported_at: '2026-11-14T00:00:00.000Z',
      count: 1,
      saves: [{ saved_at: '2026-11-01T12:00:00.000Z', title: 'T', url: 'https://x.test/', source: 'Src', note: null }],
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
    item({ title: 'Sock heels', url: 'https://example.com/heels', source: 'Knit Weekly', note: 'Clear / Finally', readers: 3 }),
    item({ title: 'Solo', url: 'https://example.org/a', readers: 1 }),
  ];

  it('joins notes, dropping blanks and flattening whitespace', () => {
    expect(joinNotes(['Clear', '  ', 'Finally\nmakes sense'])).toBe('Clear / Finally makes sense');
    expect(joinNotes(['', ' '])).toBeNull();
  });

  it('says how many members shared a link, never who', () => {
    expect(toMarkdownList(shared)).toBe(
      '- [Sock heels](https://example.com/heels) (Knit Weekly · shared by 3) — Clear / Finally\n' +
        '- [Solo](https://example.org/a)\n'
    );
    expect(toHtmlList(shared)).toContain('(Knit Weekly · shared by 3)');
  });

  it('adds a shared_by column to CSV and JSON', () => {
    const csv = toCsv(shared);
    expect(csv.split('\r\n')[0]).toBe('last_shared_at,title,url,source,notes,shared_by');
    expect(csv).toContain(',3\r\n');
    const json = JSON.parse(toJson(shared, new Date('2026-11-16T00:00:00Z')));
    expect(json.links[0]).toMatchObject({ title: 'Sock heels', notes: 'Clear / Finally', shared_by: 3 });
    expect(json.saves).toBeUndefined();
  });
});
