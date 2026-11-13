import { getDomain } from 'tldts';

/**
 * Source derivation (PLAN.md §4): registrable domain, except on multi-tenant
 * platforms where the source is the author or publication, so two Substack
 * newsletters don't collapse into one "substack.com".
 */
export function sourceForUrl(canonicalUrl: string, hints?: { authorName?: string | null }): string {
  let url: URL;
  try {
    url = new URL(canonicalUrl);
  } catch {
    return canonicalUrl;
  }
  const host = url.hostname.replace(/^www\./, '');
  const segments = url.pathname.split('/').filter(Boolean);

  // YouTube: the channel is the source; comes from oEmbed during ingest.
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    return hints?.authorName ? `youtube:${hints.authorName}` : 'youtube.com';
  }

  // Subdomain-tenant platforms: the subdomain is the publication.
  for (const platform of ['substack.com', 'tumblr.com', 'wordpress.com', 'blogspot.com', 'github.io', 'neocities.org', 'bearblog.dev']) {
    if (host.endsWith('.' + platform)) return host;
    if (host === platform) break;
  }

  // Path-tenant platforms: the first identifying path segment is the author.
  if (host === 'medium.com') {
    if (segments[0]?.startsWith('@')) return `medium.com/${segments[0]}`;
    // medium.com/publication/article-slug (skip reserved paths)
    if (segments.length >= 2 && !['p', 'm', 'tag', 'search'].includes(segments[0])) {
      return `medium.com/${segments[0]}`;
    }
    return 'medium.com';
  }

  if (host === 'bsky.app' && segments[0] === 'profile' && segments[1]) {
    return `bsky.app/${segments[1]}`;
  }

  if ((host === 'twitter.com' || host === 'x.com') && segments.length >= 1 && !['i', 'home', 'search', 'explore'].includes(segments[0])) {
    return `x.com/${segments[0].toLowerCase()}`;
  }

  if (host === 'github.com' && segments[0]) {
    return `github.com/${segments[0].toLowerCase()}`;
  }

  // Everyone else: registrable domain.
  return getDomain(url.hostname) ?? host;
}
