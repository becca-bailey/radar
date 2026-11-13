/**
 * Formats for exporting a hand-picked selection of saves (the /export page).
 * The whole-archive export with full text lives in /api/export; these are
 * the light versions: title, link, source, note and date.
 */

export interface ExportItem {
  title: string;
  url: string;
  source: string | null;
  note: string | null;
  /** ISO timestamp of when it was saved. */
  savedAt: string;
}

/** Title to show for a save whose page title may not be known yet. */
export function saveDisplayTitle(title: string | null | undefined, url: string): string {
  if (title) return title;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + u.pathname;
  } catch {
    return url;
  }
}

function escapeMarkdownText(s: string): string {
  return s.replace(/([\\`*_[\]<>])/g, '\\$1');
}

function escapeMarkdownUrl(s: string): string {
  // encodeURIComponent leaves parentheses alone, so map them by hand.
  return s.replace(/[()\s]/g, (c) => (c === '(' ? '%28' : c === ')' ? '%29' : encodeURIComponent(c)));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** `- [Title](url) (Source) — note`, one line per save. */
export function toMarkdownList(items: ExportItem[]): string {
  return items
    .map((item) => {
      let line = `- [${escapeMarkdownText(oneLine(item.title))}](${escapeMarkdownUrl(item.url)})`;
      if (item.source) line += ` (${escapeMarkdownText(oneLine(item.source))})`;
      if (item.note?.trim()) line += ` — ${escapeMarkdownText(oneLine(item.note))}`;
      return line;
    })
    .join('\n')
    .concat(items.length ? '\n' : '');
}

/** The same list as an HTML `<ul>`, so pasting into a rich-text editor keeps the links. */
export function toHtmlList(items: ExportItem[]): string {
  if (items.length === 0) return '';
  const lis = items.map((item) => {
    let li = `<a href="${escapeHtml(item.url)}">${escapeHtml(oneLine(item.title))}</a>`;
    if (item.source) li += ` (${escapeHtml(oneLine(item.source))})`;
    if (item.note?.trim()) li += ` — ${escapeHtml(oneLine(item.note))}`;
    return `<li>${li}</li>`;
  });
  return `<ul>${lis.join('')}</ul>`;
}

function csvCell(value: string | null): string {
  let s = value ?? '';
  // Spreadsheets run cells that start with these as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a header row. */
export function toCsv(items: ExportItem[]): string {
  const rows = [['saved_at', 'title', 'url', 'source', 'note']];
  for (const item of items) {
    rows.push([item.savedAt, item.title, item.url, item.source ?? '', item.note ?? '']);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function toJson(items: ExportItem[], exportedAt = new Date()): string {
  return JSON.stringify(
    {
      exported_at: exportedAt.toISOString(),
      count: items.length,
      saves: items.map((i) => ({
        saved_at: i.savedAt,
        title: i.title,
        url: i.url,
        source: i.source,
        note: i.note,
      })),
    },
    null,
    2
  );
}
