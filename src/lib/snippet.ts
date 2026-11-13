/**
 * Search snippets contain raw page text with [[[…]]] highlight markers from
 * ts_headline. Escape everything, then convert only the markers to <mark>.
 */
export function sanitizeSnippet(snippet: string): string {
  const escaped = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\[\[\[/g, '<mark>').replace(/\]\]\]/g, '</mark>');
}
