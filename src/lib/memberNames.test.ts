import { describe, expect, it } from 'vitest';
import { cleanDefaultName, cleanMemberName, MEMBER_NAME_MAX } from './memberNames';

describe('cleanMemberName', () => {
  it('trims the name', () => {
    expect(cleanMemberName('  Becca ')).toBe('Becca');
  });

  it('refuses a blank name', () => {
    expect(cleanMemberName('')).toBeNull();
    expect(cleanMemberName('   ')).toBeNull();
    expect(cleanMemberName(null)).toBeNull();
    expect(cleanMemberName(undefined)).toBeNull();
  });

  it('cuts long names to the limit without a trailing space', () => {
    const long = `${'a'.repeat(MEMBER_NAME_MAX - 1)} bcd`;
    expect(cleanMemberName(long)).toBe('a'.repeat(MEMBER_NAME_MAX - 1));
  });

  it('counts characters, so an emoji at the limit stays whole', () => {
    const name = `${'a'.repeat(MEMBER_NAME_MAX - 1)}😀😀`;
    expect(cleanMemberName(name)).toBe(`${'a'.repeat(MEMBER_NAME_MAX - 1)}😀`);
  });
});

describe('cleanDefaultName', () => {
  it('stores a blank default as empty', () => {
    expect(cleanDefaultName('  ')).toBe('');
    expect(cleanDefaultName(' Becca')).toBe('Becca');
  });
});
