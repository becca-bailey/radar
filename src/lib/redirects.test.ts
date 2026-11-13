import { describe, expect, it } from 'vitest';
import { safeLocalPath } from './redirects';

describe('safeLocalPath', () => {
  it('keeps local paths with queries', () => {
    expect(safeLocalPath('/join/abc?x=1')).toBe('/join/abc?x=1');
    expect(safeLocalPath('/')).toBe('/');
  });

  it('falls back for empty, absolute and protocol-relative values', () => {
    expect(safeLocalPath(null)).toBe('/');
    expect(safeLocalPath('')).toBe('/');
    expect(safeLocalPath('https://evil.example')).toBe('/');
    expect(safeLocalPath('//evil.example')).toBe('/');
    expect(safeLocalPath('javascript:alert(1)', '/home')).toBe('/home');
  });

  it('rejects paths browsers would turn into another host', () => {
    expect(safeLocalPath('/\\evil.example')).toBe('/');
    expect(safeLocalPath('/\t/evil.example')).toBe('/');
    expect(safeLocalPath('/\n/evil.example')).toBe('/');
  });
});
