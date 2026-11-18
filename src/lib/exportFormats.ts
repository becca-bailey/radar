/**
 * Formats for exporting a hand-picked selection of links: your own saves
 * (/export) or a group's shared links (/groups/:id/export). The whole-archive
 * export with full text lives in /api/export; these are the light versions:
 * title, link, source, note and date.
 *
 * Group rows set `savedBy` (how many people on Radar saved the link, null
 * below 2) and carry every member's note joined into `note`, with the date
 * of the latest share. Who shared is never part of an export.
 *
 * Rows marked `ownWork` ("I made this") go in their own section after the
 * rest: "From our members" in a group export, "My own work" in yours.
 */

import { savedByLabel } from './groupPool';

export const MEMBERS_HEADING = 'From our members';
export const MY_WORK_HEADING = 'My own work';

export interface ExportItem {
  title: string;
  url: string;
  source: string | null;
  note: string | null;
  /** ISO timestamp of when it was saved (for group rows: last shared). */
  savedAt: string;
  /** Marked "I made this": the saver's (or for group rows, a member's) own work. */
  ownWork?: boolean;
  /** Group rows only: people on Radar who saved it; null below 2. */
  savedBy?: number | null;
}

// Group rows always carry savedBy (null when under 2), so its presence marks
// a group export even when the value is missing.
const isGroupExport = (items: ExportItem[]) => items.some((i) => 'savedBy' in i);
const ownWorkHeading = (items: ExportItem[]) => (isGroupExport(items) ? MEMBERS_HEADING : MY_WORK_HEADING);

/** Recommendations first, then member work, each in the order given. */
function sections(items: ExportItem[]): { recommended: ExportItem[]; members: ExportItem[] } {
  return { recommended: items.filter((i) => !i.ownWork), members: items.filter((i) => i.ownWork) };
}

/** Joins several members' notes into one note field. */
export function joinNotes(notes: string[]): string | null {
  const kept = notes.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return kept.length ? kept.join(' / ') : null;
}

/** "Source", "Source · saved by 3", "saved by 3", or null. */
function sourceLabel(item: ExportItem): string | null {
  const parts: string[] = [];
  if (item.source) parts.push(oneLine(item.source));
  const savedBy = savedByLabel(item.savedBy);
  if (savedBy) parts.push(savedBy);
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

/** Escape text for HTML content or a double-quoted attribute. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * `- [Title](url) (Source) — note`, one line per save. Own work follows
 * under its own heading.
 */
export function toMarkdownList(items: ExportItem[]): string {
  const { recommended, members } = sections(items);
  const lists = [markdownLines(recommended), markdownLines(members)];
  if (!lists[1]) return lists[0];
  const heading = `## ${ownWorkHeading(items)}\n\n${lists[1]}`;
  return lists[0] ? `${lists[0]}\n${heading}` : heading;
}

function markdownLines(items: ExportItem[]): string {
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

/**
 * The same list as an HTML `<ul>`, so pasting into a rich-text editor keeps
 * the links. Own work follows under its own heading.
 */
export function toHtmlList(items: ExportItem[]): string {
  const { recommended, members } = sections(items);
  const heading = members.length ? `<h2>${escapeHtml(ownWorkHeading(items))}</h2>` : '';
  return htmlList(recommended) + heading + htmlList(members);
}

function htmlList(items: ExportItem[]): string {
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

/**
 * RFC 4180 CSV with a header row, own work last. Group exports add saved_by
 * (blank below 2) and section ("recommended" or "members"); yours add
 * own_work ("true" or "false").
 */
export function toCsv(items: ExportItem[]): string {
  const group = isGroupExport(items);
  const rows = [
    group
      ? ['last_shared_at', 'title', 'url', 'source', 'notes', 'saved_by', 'section']
      : ['saved_at', 'title', 'url', 'source', 'note', 'own_work'],
  ];
  const { recommended, members } = sections(items);
  for (const item of [...recommended, ...members]) {
    const row = [item.savedAt, item.title, item.url, item.source ?? '', item.note ?? ''];
    if (group) row.push(item.savedBy ? String(item.savedBy) : '', item.ownWork ? 'members' : 'recommended');
    else row.push(item.ownWork ? 'true' : 'false');
    rows.push(row);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * Group exports list recommendations under `links` and member work under
 * `from_our_members`; `count` covers both. Your own exports mark each save
 * with `own_work`, own work last.
 */
export function toJson(items: ExportItem[], exportedAt = new Date()): string {
  const groupLink = (i: ExportItem) => ({
    last_shared_at: i.savedAt,
    title: i.title,
    url: i.url,
    source: i.source,
    notes: i.note,
    saved_by: i.savedBy ?? null,
  });
  const { recommended, members } = sections(items);
  return JSON.stringify(
    {
      exported_at: exportedAt.toISOString(),
      count: items.length,
      ...(isGroupExport(items)
        ? { links: recommended.map(groupLink), from_our_members: members.map(groupLink) }
        : {
            saves: [...recommended, ...members].map((i) => ({
              saved_at: i.savedAt,
              title: i.title,
              url: i.url,
              source: i.source,
              note: i.note,
              own_work: !!i.ownWork,
            })),
          }),
    },
    null,
    2
  );
}
