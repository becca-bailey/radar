import { parseHTML } from 'linkedom';
import { escapeHtml } from './exportFormats';

/**
 * The reader view (RAD-21) renders a save's archived snapshot: the HTML
 * Readability extracted at ingest. That HTML comes from someone else's page,
 * so it's rebuilt here from an allowlist before it reaches the browser:
 * known tags only, a few attributes each, http(s) URLs made absolute
 * against the page they came from. Anything else is dropped, keeping its
 * text where that's safe to show.
 */

/** Tags kept as they are (attributes still filtered). */
const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'dd', 'del', 'details',
  'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'picture', 'pre', 'q', 's', 'samp',
  'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'var', 'article', 'header', 'footer', 'aside',
]);

/** Tags removed together with everything inside them. */
const DROPPED_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'form', 'input', 'button', 'select', 'textarea', 'option', 'svg', 'math', 'canvas',
  'audio', 'video', 'source', 'track', 'link', 'meta', 'base', 'head', 'title', 'dialog',
]);

/** Per-tag attributes worth keeping. */
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  ol: ['start', 'reversed'],
  li: ['value'],
  time: ['datetime'],
  abbr: ['title'],
  q: ['cite'],
  blockquote: ['cite'],
  del: ['datetime'],
  ins: ['datetime'],
};

const URL_ATTRS = new Set(['href', 'src', 'cite']);

/** Absolute http(s) URL for `value` against `base`, or null if it isn't one. */
export function safeUrl(value: string, base: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// Minimal DOM shapes, so this file doesn't depend on lib.dom typings.
interface El {
  tagName: string;
  nodeType: number;
  childNodes: ArrayLike<El>;
  parentNode: El | null;
  attributes: ArrayLike<{ name: string; value: string }>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  replaceWith(...nodes: El[]): void;
  remove(): void;
  innerHTML: string;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function clean(node: El, base: string): void {
  // Copy first: the loop replaces and removes children as it goes.
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === TEXT_NODE) continue;
    if (child.nodeType !== ELEMENT_NODE) {
      child.remove(); // comments, processing instructions
      continue;
    }
    const tag = child.tagName.toLowerCase();
    if (DROPPED_TAGS.has(tag)) {
      child.remove();
      continue;
    }
    clean(child, base);
    if (!ALLOWED_TAGS.has(tag)) {
      // Unknown wrapper (font, center, custom elements): keep its contents.
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }
    cleanAttributes(child, tag, base);
  }
}

function cleanAttributes(el: El, tag: string, base: string): void {
  const allowed = ALLOWED_ATTRS[tag] ?? [];
  for (const { name } of Array.from(el.attributes)) {
    if (!allowed.includes(name.toLowerCase())) el.removeAttribute(name);
  }
  for (const name of allowed) {
    if (!URL_ATTRS.has(name)) continue;
    const value = el.getAttribute(name);
    if (value === null) continue;
    // Fragment-only links point into the original page, at ids stripped
    // here, so resolving them would only send the reader off-site.
    const url = name === 'href' && value.trim().startsWith('#') ? null : safeUrl(value, base);
    if (url) el.setAttribute(name, url);
    else el.removeAttribute(name);
  }

  if (tag === 'a') {
    // A link with no usable target (javascript:, mailto:, #fragment) would look
    // clickable and do nothing: keep its text only. Links out never pass
    // the reader's URL along.
    if (!el.getAttribute('href')) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }
    el.setAttribute('rel', 'noopener noreferrer nofollow');
  } else if (tag === 'img') {
    if (!el.getAttribute('src')) {
      el.remove();
      return;
    }
    // Images still load from the original site: don't tell it where from,
    // and only fetch the ones scrolled to.
    el.setAttribute('loading', 'lazy');
    el.setAttribute('decoding', 'async');
    el.setAttribute('referrerpolicy', 'no-referrer');
    if (!el.getAttribute('alt')) el.setAttribute('alt', '');
  }
}

/**
 * Sanitize an archived snapshot for the reader view. `baseUrl` is the page it
 * was archived from, for resolving relative links and images.
 */
export function sanitizeSnapshot(html: string, baseUrl: string): string {
  // Parsed into a detached element, not spliced into a document string: a
  // stray </div> or </body> in the snapshot would end the root early there
  // and cut the article short.
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const root = document.createElement('div') as unknown as El;
  root.innerHTML = html;
  clean(root, baseUrl);
  return root.innerHTML.trim();
}

/**
 * Plain archived text as paragraphs, for saves that kept text but no
 * snapshot. Blank lines split paragraphs; single newlines become <br>.
 */
export function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** Minutes to read `text` at about 230 words a minute, at least 1. */
export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}
