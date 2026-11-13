import { describe, expect, it } from 'vitest';
import { lensHomePath, parseLensForm } from './lenses';

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe('parseLensForm', () => {
  it('uses the query as the name when no name is given', () => {
    expect(parseLensForm(form({ query: '  knitting   patterns ' }))).toEqual({
      name: 'knitting patterns',
      query: 'knitting patterns',
    });
  });

  it('keeps a given name, trimmed to the limit', () => {
    const result = parseLensForm(form({ name: 'K'.repeat(80), query: 'socks' }));
    expect(result).toEqual({ name: 'K'.repeat(60), query: 'socks' });
  });

  it('rejects an empty or overlong query', () => {
    expect(parseLensForm(form({ name: 'Knitting', query: '   ' }))).toHaveProperty('error');
    expect(parseLensForm(form({ query: 'x'.repeat(201) }))).toHaveProperty('error');
  });
});

describe('lensHomePath', () => {
  it('puts personal lenses on Explore and group lenses on the group page', () => {
    expect(lensHomePath(null)).toBe('/explore');
    expect(lensHomePath(null, 'l1')).toBe('/explore?lens=l1');
    expect(lensHomePath('g1')).toBe('/groups/g1');
    expect(lensHomePath('g1', 'l1')).toBe('/groups/g1?lens=l1');
  });
});
