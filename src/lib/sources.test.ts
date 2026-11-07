import { describe, expect, it } from 'vitest';
import { sourceForUrl } from './sources';

describe('sourceForUrl', () => {
  it('uses the registrable domain by default', () => {
    expect(sourceForUrl('https://www.nytimes.com/2026/11/01/arts/thing.html')).toBe('nytimes.com');
    expect(sourceForUrl('https://blog.somestudio.co.uk/post')).toBe('somestudio.co.uk');
  });

  it('treats substack subdomains as distinct sources', () => {
    expect(sourceForUrl('https://performanceanxiety.substack.com/p/the-post')).toBe(
      'performanceanxiety.substack.com'
    );
    expect(sourceForUrl('https://www.othernewsletter.substack.com/p/x')).toBe(
      'othernewsletter.substack.com'
    );
  });

  it('treats medium authors and publications as sources', () => {
    expect(sourceForUrl('https://medium.com/@writer/some-story-abc123')).toBe('medium.com/@writer');
    expect(sourceForUrl('https://medium.com/the-publication/story-abc')).toBe(
      'medium.com/the-publication'
    );
    expect(sourceForUrl('https://medium.com/p/abc123')).toBe('medium.com');
  });

  it('uses the youtube channel when known, youtube.com otherwise', () => {
    expect(sourceForUrl('https://youtube.com/watch?v=abc', { authorName: 'Some Channel' })).toBe(
      'youtube:Some Channel'
    );
    expect(sourceForUrl('https://youtu.be/abc')).toBe('youtube.com');
  });

  it('uses bluesky and x handles', () => {
    expect(sourceForUrl('https://bsky.app/profile/becca.example.com/post/xyz')).toBe(
      'bsky.app/becca.example.com'
    );
    expect(sourceForUrl('https://x.com/SomeOne/status/123')).toBe('x.com/someone');
  });

  it('uses github owners and tenant blog subdomains', () => {
    expect(sourceForUrl('https://github.com/Becca-Bailey/ravelry-study')).toBe(
      'github.com/becca-bailey'
    );
    expect(sourceForUrl('https://mysite.github.io/post/')).toBe('mysite.github.io');
    expect(sourceForUrl('https://someone.tumblr.com/post/1')).toBe('someone.tumblr.com');
  });

  it('strips www but keeps platform roots sane', () => {
    expect(sourceForUrl('https://www.substack.com/home')).toBe('substack.com');
    expect(sourceForUrl('https://medium.com')).toBe('medium.com');
  });
});
