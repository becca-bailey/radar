import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './invites';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Pat@Example.COM ')).toBe('pat@example.com');
  });

  it('rejects things that are not emails', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('pat')).toBeNull();
    expect(normalizeEmail('pat@localhost')).toBeNull();
    expect(normalizeEmail('pat @example.com')).toBeNull();
  });
});
