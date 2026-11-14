import { assertPublicUrl, BlockedUrlError, defaultLookup, type LookupFn } from './publicUrl';

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = 'RadarBot/0.1 (link archiver; saves pages its users asked it to save)';

export { BlockedUrlError };

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  /** null when the response was not HTML or could not be read. */
  html: string | null;
}

export interface FetchPageOptions {
  fetchImpl?: typeof fetch;
  /** DNS resolver used for the private-address check; injectable for tests. */
  lookup?: LookupFn;
}

/**
 * Fetch a page for archiving: follows redirects, enforces a timeout and a
 * size cap, and only returns a body for HTML responses. Never throws for
 * HTTP-level failures — callers decide what a 404 means for the job.
 *
 * Throws `BlockedUrlError` when the URL, or any redirect along the way, points
 * at a non-http(s) scheme or a loopback, private, link-local or otherwise
 * internal address (SSRF). Redirects are followed by hand so every hop is
 * checked before it is requested.
 */
export async function fetchPage(url: string, options: FetchPageOptions = {}): Promise<FetchedPage> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookup = options.lookup ?? defaultLookup;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = await assertPublicUrl(url, lookup);
    let res: Response;
    for (let hops = 0; ; hops++) {
      res = await fetchImpl(current.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en',
        },
      });
      const location = res.headers.get('Location');
      if (!REDIRECT_STATUSES.has(res.status) || !location) break;

      await res.body?.cancel().catch(() => {});
      if (hops >= MAX_REDIRECTS) throw new Error(`Too many redirects fetching ${url}`);
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new BlockedUrlError(location, `invalid redirect from ${current.href}`);
      }
      current = await assertPublicUrl(next, lookup);
    }

    const contentType = res.headers.get('Content-Type') ?? '';
    const isHtml = /text\/html|application\/xhtml/i.test(contentType);
    let html: string | null = null;

    if (isHtml && res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (received < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
      }
      await reader.cancel().catch(() => {});
      html = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks, received));
    } else {
      await res.body?.cancel().catch(() => {});
    }

    return { finalUrl: current.href, status: res.status, contentType, html };
  } finally {
    clearTimeout(timer);
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.max(0, out.length - offset));
    out.set(slice, offset);
    offset += slice.length;
    if (offset >= out.length) break;
  }
  return out;
}
