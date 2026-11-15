import { describe, expect, it } from 'vitest';
import { saveErrorPath, saveFormOrigin, saveSuccessPath } from './saveRedirects';

const params = (path: string) => new URL(path, 'https://radar.test').searchParams;

describe('saveFormOrigin', () => {
  it('is the popup only for return_to=save', () => {
    expect(saveFormOrigin('save')).toBe('popup');
    expect(saveFormOrigin(null)).toBe('home');
    expect(saveFormOrigin('/elsewhere')).toBe('home');
  });
});

describe('saveSuccessPath', () => {
  it('offers undo on home for a new save only', () => {
    expect(saveSuccessPath('home', { saveId: 'abc', alreadySaved: false })).toBe('/?saved=1&undo_save=abc');
    expect(saveSuccessPath('home', { saveId: 'abc', alreadySaved: true })).toBe('/?saved=1');
  });

  it('tells the popup when the link was already saved', () => {
    expect(saveSuccessPath('popup', { saveId: 'abc', alreadySaved: false })).toBe('/save?done=1');
    expect(saveSuccessPath('popup', { saveId: 'abc', alreadySaved: true })).toBe('/save?done=1&already=1');
  });
});

describe('saveErrorPath', () => {
  it('keeps the url and title in the popup so the person can retry', () => {
    const path = saveErrorPath('popup', 'That does not look like a web link.', {
      url: 'notalink & more',
      title: 'A title: with ?odd= chars',
    });
    expect(path.startsWith('/save?')).toBe(true);
    const p = params(path);
    expect(p.get('url')).toBe('notalink & more');
    expect(p.get('title')).toBe('A title: with ?odd= chars');
    expect(p.get('error')).toBe('That does not look like a web link.');
  });

  it('leaves out an empty url or title', () => {
    const p = params(saveErrorPath('popup', 'Paste a link to save.', { url: '', title: null }));
    expect(p.has('url')).toBe(false);
    expect(p.has('title')).toBe(false);
    expect(p.get('error')).toBe('Paste a link to save.');
  });

  it('sends home errors back to the home page', () => {
    const path = saveErrorPath('home', 'Saving failed. Try again.', { url: 'https://x.test', title: null });
    expect(path.startsWith('/?')).toBe(true);
    expect(params(path).get('error')).toBe('Saving failed. Try again.');
    expect(params(path).has('url')).toBe(false);
  });
});
