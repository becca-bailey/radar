import { describe, expect, it } from 'vitest';
import { firstLink, sharedPage } from './shareTarget';

const p = (q: Record<string, string>) => new URLSearchParams(q);

describe('firstLink', () => {
  it('finds a link inside text', () => {
    expect(firstLink('Read this https://example.com/a?b=1 now')).toBe('https://example.com/a?b=1');
  });
  it('drops trailing punctuation and an unmatched bracket', () => {
    expect(firstLink('(see https://example.com/a).')).toBe('https://example.com/a');
    expect(firstLink('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
  });
  it('returns null when there is no link', () => {
    expect(firstLink('nothing here')).toBeNull();
  });
});

describe('sharedPage', () => {
  it('uses url and title when the app sends them', () => {
    expect(sharedPage(p({ url: 'https://example.com/a', title: 'A story' }))).toEqual({
      url: 'https://example.com/a',
      title: 'A story',
    });
  });

  it('finds the link in text when url is empty, and keeps the headline as the title', () => {
    expect(sharedPage(p({ url: '', text: 'A good read https://example.com/a', title: '' }))).toEqual({
      url: 'https://example.com/a',
      title: 'A good read',
    });
  });

  it('drops a separator left after removing the link', () => {
    expect(sharedPage(p({ text: 'Headline - https://example.com/a' })).title).toBe('Headline');
  });

  it('ignores a title that is just the link', () => {
    expect(sharedPage(p({ text: 'https://example.com/a', title: 'https://example.com/a' }))).toEqual({
      url: 'https://example.com/a',
      title: '',
    });
  });

  it('keeps url exactly as sent, trailing punctuation included', () => {
    expect(sharedPage(p({ url: 'https://en.wikipedia.org/wiki/Washington,_D.C.' })).url).toBe(
      'https://en.wikipedia.org/wiki/Washington,_D.C.'
    );
  });

  it('prefers url over a link in text', () => {
    expect(sharedPage(p({ url: 'https://example.com/a', text: 'see https://other.com' })).url).toBe(
      'https://example.com/a'
    );
  });

  it('keeps text without a link as the title, with no url', () => {
    expect(sharedPage(p({ text: 'just words' }))).toEqual({ url: '', title: 'just words' });
  });

  it('returns empty fields for an empty share', () => {
    expect(sharedPage(p({}))).toEqual({ url: '', title: '' });
  });
});
