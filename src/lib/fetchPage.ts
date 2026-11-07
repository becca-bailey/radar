const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'RabbitHoleBot/0.1 (link archiver; saves pages its users asked it to save)';

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  /** null when the response was not HTML or could not be read. */
  html: string | null;
}

/**
 * Fetch a page for archiving: follows redirects, enforces a timeout and a
 * size cap, and only returns a body for HTML responses. Never throws for
 * HTTP-level failures — callers decide what a 404 means for the job.
 */
export async function fetchPage(url: string, fetchImpl: typeof fetch = fetch): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en',
      },
    });

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
    }

    return { finalUrl: res.url || url, status: res.status, contentType, html };
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
