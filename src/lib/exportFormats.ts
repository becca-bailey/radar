/**
 * Formats for exporting a hand-picked selection of links: your own saves
 * (/export) or a group's shared links (/groups/:id/export). The whole-archive
 * export with full text lives in /api/export; these are the light versions:
 * title, link, source, note and date.
 *
 * Group rows set `readers` (how many members shared the link) and carry
 * every member's note joined into `note`, with the date of the latest share.
 * Who shared is never part of an export.
 */

export interface ExportItem {
  title: string;
  url: string;
  source: string | null;
  note: string | null;
  /** ISO timestamp of when it was saved (for group rows: last shared). */
  savedAt: string;
  /** Group rows only: distinct members who shared it. */
  readers?: number;
}

const isGroupExport = (items: ExportItem[]) => items.some((i) => i.readers !== undefined);

/** Joins several members' notes into one note field. */
export function joinNotes(notes: string[]): string | null {
  const kept = notes.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return kept.length ? kept.join(' / ') : null;
}

/** "Source", "Source · shared by 3", "shared by 3", or null. */
function sourceLabel(item: ExportItem): string | null {
  const parts: string[] = [];
  if (item.source) parts.push(oneLine(item.source));
  if (item.readers && item.readers > 1) parts.push(`shared by ${item.readers}`);
  return parts.length ? parts.join(' · ') : null;
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
      const label = sourceLabel(item);
      if (label) line += ` (${escapeMarkdownText(label)})`;
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
    const label = sourceLabel(item);
    if (label) li += ` (${escapeHtml(label)})`;
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

/** RFC 4180 CSV with a header row. Group exports add a shared_by column. */
export function toCsv(items: ExportItem[]): string {
  const group = isGroupExport(items);
  const rows = [
    group
      ? ['last_shared_at', 'title', 'url', 'source', 'notes', 'shared_by']
      : ['saved_at', 'title', 'url', 'source', 'note'],
  ];
  for (const item of items) {
    const row = [item.savedAt, item.title, item.url, item.source ?? '', item.note ?? ''];
    if (group) row.push(String(item.readers ?? 1));
    rows.push(row);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function toJson(items: ExportItem[], exportedAt = new Date()): string {
  return JSON.stringify(
    {
      exported_at: exportedAt.toISOString(),
      count: items.length,
      ...(isGroupExport(items)
        ? {
            links: items.map((i) => ({
              last_shared_at: i.savedAt,
              title: i.title,
              url: i.url,
              source: i.source,
              notes: i.note,
              shared_by: i.readers ?? 1,
            })),
          }
        : {
            saves: items.map((i) => ({
              saved_at: i.savedAt,
              title: i.title,
              url: i.url,
              source: i.source,
              note: i.note,
            })),
          }),
    },
    null,
    2
  );
}
