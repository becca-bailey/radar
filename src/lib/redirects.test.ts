import { describe, expect, it } from 'vitest';
import { safeLocalPath, withOwnQuery } from './redirects';

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

describe('withOwnQuery', () => {
  const origin = 'https://onyourradar.app';

  it('adds an empty query to same-site paths without one', () => {
    expect(withOwnQuery('/', origin)).toBe('/?');
    expect(withOwnQuery('/login', origin)).toBe('/login?');
    expect(withOwnQuery('/settings#delete-account', origin)).toBe('/settings?#delete-account');
    expect(withOwnQuery('https://onyourradar.app/groups', origin)).toBe('https://onyourradar.app/groups?');
  });

  it('leaves locations that already have a query', () => {
    expect(withOwnQuery('/login?error=x', origin)).toBe('/login?error=x');
    expect(withOwnQuery('/?', origin)).toBe('/?');
    expect(withOwnQuery('/settings?error=x#delete-account', origin)).toBe('/settings?error=x#delete-account');
  });

  it('leaves other sites alone', () => {
    expect(withOwnQuery('https://evil.example/', origin)).toBe('https://evil.example/');
    expect(withOwnQuery('//evil.example/', origin)).toBe('//evil.example/');
  });
});
