/**
 * URL canonicalization (PLAN.md §4).
 *
 * One Link row per canonical URL across the whole system, so this module is
 * load-bearing for dedupe, per-source caps, and moderation. Everything here is
 * pure and synchronous; the async redirect-following wrapper lives with the
 * ingest code and feeds results back through these functions.
 *
 * Pipeline: unwrap AMP cache URLs → (after fetch) honor <link rel="canonical">
 * → strip tracking params → normalize host/port/slash.
 */

/** Query params that are tracking noise on any site. */
const STRIP_EXACT = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'twclid',
  'yclid',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'vero_id',
  'oly_anon_id',
  'oly_enc_id',
  'rb_clickid',
  's_cid',
  'ncid',
  'cmpid',
  'spm',
  'sk',
  'ref',
  'ref_src',
  'ref_url',
  'referrer',
  'source',
  'smid',
]);

const STRIP_PREFIXES = ['utm_', '_hs', 'pk_', 'piwik_', 'matomo_'];

/** Host-specific tracking params (registrable-host suffix → param names). */
const STRIP_BY_HOST: Array<[suffix: string, params: string[]]> = [
  ['youtube.com', ['si', 'feature', 'pp']],
  ['youtu.be', ['si', 'feature']],
  ['open.spotify.com', ['si', 'context']],
  ['twitter.com', ['s', 't']],
  ['x.com', ['s', 't']],
  ['substack.com', ['r', 'triedRedirect']],
  ['amazon.com', ['tag', 'linkCode', 'linkId', 'ref_', 'pd_rd_r', 'pd_rd_w', 'pd_rd_wg', 'psc', 'th', 'crid', 'sprefix', 'keywords', 'qid', 'sr', 'dib', 'dib_tag']],
];

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith('.' + suffix);
}

function shouldStripParam(name: string, host: string): boolean {
  const lower = name.toLowerCase();
  if (STRIP_EXACT.has(lower)) return true;
  if (STRIP_PREFIXES.some((p) => lower.startsWith(p))) return true;
  for (const [suffix, params] of STRIP_BY_HOST) {
    if (hostMatches(host, suffix) && params.includes(name)) return true;
  }
  return false;
}

/**
 * Unwrap Google AMP cache URLs
 * (…cdn.ampproject.org/c/s/example.com/path → https://example.com/path).
 * Other AMP variants (amp subdomains, /amp paths) resolve through the page's
 * own rel="canonical" instead of guesswork.
 */
export function unwrapAmpCacheUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }
  if (!url.hostname.endsWith('.cdn.ampproject.org') && url.hostname !== 'cdn.ampproject.org') {
    return input;
  }
  // Path forms: /c/s/host/path (secure), /c/host/path, /v/s/host/path, /v/host/path
  const m = url.pathname.match(/^\/[cv]\/(s\/)?(.+)$/);
  if (!m) return input;
  const scheme = m[1] ? 'https' : 'http';
  return `${scheme}://${m[2]}${url.search}`;
}

/**
 * Extract an absolute <link rel="canonical"> href from an HTML document.
 * Returns null when absent or not http(s). Regex-based on purpose: it runs on
 * untrusted pages inside the save path, and <link> tags in <head> are flat
 * enough that a parser adds risk, not accuracy.
 */
export function extractCanonicalHref(html: string, baseUrl: string): string | null {
  // Only scan the head-ish region to avoid body false positives in huge docs.
  const head = html.slice(0, 200_000);
  const linkTags = head.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const relMatch = tag.match(/\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const rel = (relMatch?.[2] ?? relMatch?.[3] ?? relMatch?.[4] ?? '').toLowerCase();
    if (!rel.split(/\s+/).includes('canonical')) continue;
    const hrefMatch = tag.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4];
    if (!href) continue;
    try {
      const resolved = new URL(decodeHtmlEntities(href.trim()), baseUrl);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        return resolved.toString();
      }
    } catch {
      // fall through to next tag
    }
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Normalize a URL into its canonical string form:
 * lowercase scheme+host, drop default ports, strip fragment and tracking
 * params, sort remaining params, trim trailing slash (except root).
 * Throws TypeError on unparseable or non-http(s) input.
 */
export function normalizeUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`Not an http(s) URL: ${input}`);
  }

  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  url.username = '';
  url.password = '';
  // URL drops default ports for the scheme automatically, but normalize
  // explicit ones like :443 on https.
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = '';
  }

  const kept: Array<[string, string]> = [];
  for (const [name, value] of url.searchParams) {
    if (!shouldStripParam(name, url.hostname)) kept.push([name, value]);
  }
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [name, value] of kept) url.searchParams.append(name, value);

  let path = url.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  url.pathname = path;

  return url.toString();
}

/**
 * Full canonicalization given the final fetched URL (after redirects) and the
 * page HTML (may be empty when the fetch failed — the URL alone still
 * canonicalizes). AMP cache unwrap happens before any fetch; rel="canonical"
 * is honored afterward, then everything is normalized.
 */
export function canonicalUrlFor(finalUrl: string, html: string | null): string {
  const unwrapped = unwrapAmpCacheUrl(finalUrl);
  const declared = html ? extractCanonicalHref(html, unwrapped) : null;
  // A page that declares a canonical of "/" for an article is a misconfigured
  // CMS, not a signal; ignore canonical hrefs that point at a bare origin when
  // the current page has a real path.
  if (declared) {
    try {
      const d = new URL(declared);
      const current = new URL(unwrapped);
      const declaredIsRoot = d.pathname === '/' && !d.search;
      const currentHasPath = current.pathname !== '/' || !!current.search;
      if (!(declaredIsRoot && currentHasPath)) {
        return normalizeUrl(declared);
      }
    } catch {
      // ignore and use the fetched URL
    }
  }
  return normalizeUrl(unwrapped);
}
