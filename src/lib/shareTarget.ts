/**
 * Android's share sheet opens /save with the shared page in the query string
 * (the manifest's share_target, RAD-25). Apps fill the fields differently:
 * Chrome sends `url`, but many apps leave it empty and put the link in
 * `text`, often after the headline ("Some story https://…"). This picks out
 * one link and a provisional title from whatever arrived.
 */
export interface SharedPage {
  url: string;
  title: string;
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"]+/i;

/** The first http(s) link in a piece of text, without trailing punctuation. */
export function firstLink(text: string): string | null {
  const match = URL_IN_TEXT.exec(text);
  if (!match) return null;
  // "(see https://example.com/a)." keeps the link, not the ")."
  let url = match[0].replace(/[.,;:!?'’"”]+$/, '');
  if (url.endsWith(')') && !url.includes('(')) url = url.slice(0, -1);
  return url;
}

export function sharedPage(params: URLSearchParams): SharedPage {
  const rawUrl = (params.get('url') ?? '').trim();
  const text = (params.get('text') ?? '').trim();
  let title = (params.get('title') ?? '').trim();

  // `url` is the page's address exactly (the bookmarklet sends location.href),
  // so it's used as sent: a final "." or ")" can be part of it.
  const url = rawUrl || firstLink(text) || '';

  // With no title, the text around the link is usually the headline.
  if (!title && text) {
    const rest = url ? text.replace(url, '') : text;
    title = rest.replace(/\s+/g, ' ').replace(/[\s\-–—|:]+$/, '').trim();
  }
  // Some apps send the link as the title too; that's not a title.
  if (title === url || firstLink(title) === title) title = '';

  return { url, title: title.slice(0, 300) };
}
