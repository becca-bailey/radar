/**
 * Lightweight OpenGraph / schema.org sniffing at ingest. This is what keeps
 * the Link model generic: product pages, videos, and audio get a `kind` and
 * an image/price in metadata without any schema changes.
 */

import { decodeHtmlEntities } from './htmlEntities';

export interface OpenGraphData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  type: string | null;
  price: string | null;
  currency: string | null;
  kind: 'article' | 'product' | 'video' | 'audio' | 'other';
}

export function extractOpenGraph(html: string): OpenGraphData {
  // Scan to the real end of <head> when we can find it: YouTube puts its og
  // tags ~850KB in, after huge inline scripts. The byte cap is a guard
  // against pathological pages with no </head> at all.
  const headEnd = html.search(/<\/head\s*>/i);
  const head = html.slice(0, headEnd > -1 ? Math.min(headEnd, 2_000_000) : 300_000);
  const metas = new Map<string, string>();

  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const keyMatch = tag.match(/\b(?:property|name|itemprop)\s*=\s*("([^"]*)"|'([^']*)')/i);
    const contentMatch = tag.match(/\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i);
    const key = (keyMatch?.[2] ?? keyMatch?.[3])?.toLowerCase();
    const content = contentMatch?.[2] ?? contentMatch?.[3];
    if (key && content && !metas.has(key)) metas.set(key, decodeHtmlEntities(content));
  }

  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = metas.get(k);
      if (v) return v;
    }
    return null;
  };

  const ogType = get('og:type');
  const price = get('product:price:amount', 'og:price:amount', 'price');
  const hasProductJsonLd = /"@type"\s*:\s*"?Product"?/i.test(head);

  let kind: OpenGraphData['kind'] = 'article';
  const t = (ogType ?? '').toLowerCase();
  if (t.startsWith('product') || hasProductJsonLd || price) kind = 'product';
  else if (t.startsWith('video')) kind = 'video';
  else if (t.startsWith('music') || t.startsWith('audio')) kind = 'audio';
  else if (t && !t.startsWith('article') && t !== 'website' && t !== 'blog') kind = 'other';

  return {
    title: get('og:title', 'twitter:title'),
    description: get('og:description', 'twitter:description', 'description'),
    image: get('og:image', 'og:image:url', 'twitter:image'),
    siteName: get('og:site_name'),
    type: ogType,
    price,
    currency: get('product:price:currency', 'og:price:currency'),
    kind,
  };
}
