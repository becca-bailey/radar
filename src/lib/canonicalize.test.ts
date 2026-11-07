import { describe, expect, it } from 'vitest';
import {
  canonicalUrlFor,
  extractCanonicalHref,
  normalizeUrl,
  unwrapAmpCacheUrl,
} from './canonicalize';

describe('normalizeUrl', () => {
  it('lowercases host and drops default ports', () => {
    expect(normalizeUrl('HTTPS://Example.COM:443/Path')).toBe('https://example.com/Path');
    expect(normalizeUrl('http://example.com:80/a')).toBe('http://example.com/a');
  });

  it('keeps non-default ports', () => {
    expect(normalizeUrl('http://example.com:8080/a')).toBe('http://example.com:8080/a');
  });

  it('preserves path case', () => {
    expect(normalizeUrl('https://example.com/CaseSensitive/Path')).toBe(
      'https://example.com/CaseSensitive/Path'
    );
  });

  it('strips fragments and credentials', () => {
    expect(normalizeUrl('https://user:pw@example.com/a#section-2')).toBe('https://example.com/a');
  });

  it('removes trailing slash except at root', () => {
    expect(normalizeUrl('https://example.com/posts/')).toBe('https://example.com/posts');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('strips utm_* and common click ids', () => {
    expect(
      normalizeUrl(
        'https://example.com/a?utm_source=tw&utm_medium=social&utm_campaign=x&fbclid=abc&gclid=1'
      )
    ).toBe('https://example.com/a');
  });

  it('strips ref and mailing-list params', () => {
    expect(normalizeUrl('https://blog.example.com/post?ref=hn&mc_cid=x&mc_eid=y')).toBe(
      'https://blog.example.com/post'
    );
  });

  it('keeps meaningful params and sorts them', () => {
    expect(normalizeUrl('https://example.com/search?q=knitting&page=2&utm_source=x')).toBe(
      'https://example.com/search?page=2&q=knitting'
    );
  });

  it('keeps YouTube video ids but strips si', () => {
    expect(normalizeUrl('https://www.youtube.com/watch?v=abc123&si=SHAREJUNK')).toBe(
      'https://www.youtube.com/watch?v=abc123'
    );
    expect(normalizeUrl('https://youtu.be/abc123?si=xyz&feature=shared')).toBe(
      'https://youtu.be/abc123'
    );
  });

  it('strips twitter/x share params only on those hosts', () => {
    expect(normalizeUrl('https://x.com/someone/status/123?s=46&t=tok')).toBe(
      'https://x.com/someone/status/123'
    );
    // s and t are meaningful elsewhere
    expect(normalizeUrl('https://example.com/a?s=46&t=tok')).toBe('https://example.com/a?s=46&t=tok');
  });

  it('strips substack share params', () => {
    expect(
      normalizeUrl('https://newsletter.substack.com/p/the-post?r=abc12&utm_campaign=post')
    ).toBe('https://newsletter.substack.com/p/the-post');
  });

  it('strips amazon affiliate/session params but keeps the product path', () => {
    expect(
      normalizeUrl('https://www.amazon.com/dp/B000123?tag=aff-20&linkCode=ll1&psc=1&th=1')
    ).toBe('https://www.amazon.com/dp/B000123');
  });

  it('rejects non-http schemes', () => {
    expect(() => normalizeUrl('ftp://example.com/a')).toThrow(TypeError);
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(TypeError);
    expect(() => normalizeUrl('not a url')).toThrow();
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  https://example.com/a  ')).toBe('https://example.com/a');
  });
});

describe('unwrapAmpCacheUrl', () => {
  it('unwraps secure google amp cache urls', () => {
    expect(
      unwrapAmpCacheUrl('https://www-example-com.cdn.ampproject.org/c/s/www.example.com/post/1')
    ).toBe('https://www.example.com/post/1');
  });

  it('unwraps non-secure form to http', () => {
    expect(unwrapAmpCacheUrl('https://cdn.ampproject.org/c/example.com/a')).toBe(
      'http://example.com/a'
    );
  });

  it('preserves query strings', () => {
    expect(
      unwrapAmpCacheUrl('https://x.cdn.ampproject.org/v/s/example.com/a?page=2')
    ).toBe('https://example.com/a?page=2');
  });

  it('leaves non-amp urls alone', () => {
    expect(unwrapAmpCacheUrl('https://example.com/ampproject')).toBe(
      'https://example.com/ampproject'
    );
    expect(unwrapAmpCacheUrl('nonsense')).toBe('nonsense');
  });
});

describe('extractCanonicalHref', () => {
  it('finds a double-quoted canonical link', () => {
    const html = '<html><head><link rel="canonical" href="https://example.com/real" /></head>';
    expect(extractCanonicalHref(html, 'https://example.com/amp/real')).toBe(
      'https://example.com/real'
    );
  });

  it('handles single quotes, attribute order, and multi-value rel', () => {
    const html = "<link href='/real' rel='stylesheet canonical'>";
    expect(extractCanonicalHref(html, 'https://example.com/amp')).toBe('https://example.com/real');
  });

  it('resolves relative hrefs against the base url', () => {
    const html = '<link rel="canonical" href="../posts/1">';
    expect(extractCanonicalHref(html, 'https://example.com/amp/x')).toBe(
      'https://example.com/posts/1'
    );
  });

  it('decodes &amp; in hrefs', () => {
    const html = '<link rel="canonical" href="https://example.com/a?x=1&amp;y=2">';
    expect(extractCanonicalHref(html, 'https://example.com/')).toBe('https://example.com/a?x=1&y=2');
  });

  it('ignores stylesheet links and non-http canonicals', () => {
    expect(
      extractCanonicalHref('<link rel="stylesheet" href="/style.css">', 'https://example.com/')
    ).toBeNull();
    expect(
      extractCanonicalHref('<link rel="canonical" href="ftp://example.com/a">', 'https://example.com/')
    ).toBeNull();
  });

  it('returns null when absent', () => {
    expect(extractCanonicalHref('<html><head></head></html>', 'https://example.com/')).toBeNull();
  });
});

describe('canonicalUrlFor', () => {
  it('prefers the declared canonical and normalizes it', () => {
    const html =
      '<link rel="canonical" href="https://Example.com/posts/hello/?utm_source=amp#top">';
    expect(canonicalUrlFor('https://example.com/posts/hello/amp/', html)).toBe(
      'https://example.com/posts/hello'
    );
  });

  it('falls back to the fetched url without html', () => {
    expect(canonicalUrlFor('https://example.com/a/?utm_source=x', null)).toBe(
      'https://example.com/a'
    );
  });

  it('ignores a canonical that points at the bare origin from an article page', () => {
    const html = '<link rel="canonical" href="https://example.com/">';
    expect(canonicalUrlFor('https://example.com/posts/real-article', html)).toBe(
      'https://example.com/posts/real-article'
    );
  });

  it('accepts a root canonical when the page is the root', () => {
    const html = '<link rel="canonical" href="https://example.com/">';
    expect(canonicalUrlFor('https://example.com/?utm_source=x', html)).toBe('https://example.com/');
  });

  it('unwraps amp cache before applying the canonical', () => {
    const html = '<link rel="canonical" href="/posts/1">';
    expect(
      canonicalUrlFor('https://www-example-com.cdn.ampproject.org/c/s/www.example.com/posts/1/amp', html)
    ).toBe('https://www.example.com/posts/1');
  });
});
