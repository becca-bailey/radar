import { describe, expect, it } from 'vitest';
import { afterCursorFilter, nextPageHref, parseCursor } from './archiveCursor';

const ID = '3f2b8c1e-9a4d-4e2f-8b1a-0c9d8e7f6a5b';
const TS = '2026-11-14T10:00:00.123456+00:00';

describe('archive cursor', () => {
  it('round-trips through the href, keeping the +offset and microseconds', () => {
    const href = nextPageHref({ createdAt: TS, id: ID }, 'science');
    const params = new URL(href, 'https://example.test').searchParams;
    expect(params.get('topic')).toBe('science');
    expect(parseCursor(params)).toEqual({ createdAt: TS, id: ID });
  });

  it('omits topic when unfiltered', () => {
    expect(nextPageHref({ createdAt: TS, id: ID }, null)).not.toContain('topic');
  });

  it('accepts Z and no fractional seconds', () => {
    const p = new URLSearchParams({ before: '2026-11-14T10:00:00Z', before_id: ID });
    expect(parseCursor(p)).toEqual({ createdAt: '2026-11-14T10:00:00Z', id: ID });
  });

  it('rejects missing or malformed parts', () => {
    expect(parseCursor(new URLSearchParams())).toBeNull();
    expect(parseCursor(new URLSearchParams({ before: TS }))).toBeNull();
    expect(parseCursor(new URLSearchParams({ before: TS, before_id: 'nope' }))).toBeNull();
    // An unencoded + arrives as a space.
    expect(parseCursor(new URLSearchParams({ before: TS.replace('+', ' '), before_id: ID }))).toBeNull();
    // Filter injection attempts.
    expect(parseCursor(new URLSearchParams({ before: `${TS}),id.gt.0`, before_id: ID }))).toBeNull();
    expect(parseCursor(new URLSearchParams({ before: TS, before_id: `${ID},x` }))).toBeNull();
  });

  it('builds a compound (created_at, id) filter', () => {
    expect(afterCursorFilter({ createdAt: TS, id: ID })).toBe(
      `created_at.lt."${TS}",and(created_at.eq."${TS}",id.lt.${ID})`
    );
  });
});
