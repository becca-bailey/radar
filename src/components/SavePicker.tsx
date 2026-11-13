import * as React from 'react';
import { CheckIcon, ChevronDownIcon, CopyIcon, DownloadIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toCsv, toHtmlList, toJson, toMarkdownList, type ExportItem } from '@/lib/exportFormats';

export interface PickerRow extends ExportItem {
  id: string;
  /** Preformatted on the server so hydration matches. */
  savedOn: string;
  image: string | null;
}

interface Props {
  rows: PickerRow[];
  /** What a row is called in status messages: "save" or "link". */
  noun?: string;
  /** Start of downloaded file names. */
  filePrefix?: string;
}

const DOWNLOADS = [
  { label: 'Markdown (.md)', ext: 'md', type: 'text/markdown', render: toMarkdownList },
  { label: 'CSV (.csv)', ext: 'csv', type: 'text/csv', render: toCsv },
  { label: 'JSON (.json)', ext: 'json', type: 'application/json', render: (items: ExportItem[]) => toJson(items) },
] as const;

/**
 * Checkbox list of saves with a select-all box and an action bar: copy the
 * picked saves as a list (rich text + Markdown) or download them as
 * Markdown, CSV or JSON. Output follows the on-screen order.
 */
export default function SavePicker({ rows, noun = 'save', filePrefix = 'radar-saves' }: Props) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [status, setStatus] = React.useState('');
  const allRef = React.useRef<HTMLInputElement>(null);

  const count = selected.size;
  const allChecked = rows.length > 0 && count === rows.length;
  const someChecked = count > 0 && !allChecked;

  React.useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someChecked;
  }, [someChecked]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  const picked = () => rows.filter((r) => selected.has(r.id));

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 2500);
  };

  const copy = async () => {
    const items = picked();
    const markdown = toMarkdownList(items);
    const label = `Copied ${items.length} ${noun}${items.length === 1 ? '' : 's'}`;
    // Rich text keeps the links when pasted into an editor like Substack,
    // Notion or Google Docs; the plain-text flavor is Markdown.
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([toHtmlList(items)], { type: 'text/html' }),
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
        }),
      ]);
      flash(label);
      return;
    } catch {
      /* fall through to plain text */
    }
    try {
      await navigator.clipboard.writeText(markdown);
      flash(label + ' as Markdown');
      return;
    } catch {
      /* fall through to the textarea trick */
    }
    // Same fallback as SaveMenu, for blocked clipboard APIs.
    const ta = document.createElement('textarea');
    ta.value = markdown;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* nothing left to try */
    }
    ta.remove();
    flash(ok ? label + ' as Markdown' : "Couldn't reach the clipboard. Try a download instead.");
  };

  const download = (format: (typeof DOWNLOADS)[number]) => {
    const blob = new Blob([format.render(picked())], { type: `${format.type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.${format.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <label className="mt-2 flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
        <input
          ref={allRef}
          className="size-4 accent-primary"
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
        />
        Select all ({rows.length})
      </label>

      <ul className="my-4 grid list-none gap-3.5 p-0">
        {rows.map((row) => {
          const isOn = selected.has(row.id);
          return (
            <li key={row.id}>
              <label className="block cursor-pointer">
                <Card
                  className={cn(
                    'transition-colors',
                    isOn && 'bg-[color-mix(in_srgb,var(--candy-butter)_22%,var(--card))]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      className="mt-1 size-4 shrink-0 accent-primary"
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggle(row.id)}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <CardHeader>
                        <CardTitle>{row.title}</CardTitle>
                        <CardDescription>
                          {row.source ? `${row.source} · ` : ''}
                          {row.readers && row.readers > 1 ? `shared by ${row.readers} · ` : ''}
                          {row.savedOn}
                        </CardDescription>
                      </CardHeader>
                      {row.note && <p className="m-0 font-display text-[1.02rem] italic">{row.note}</p>}
                    </div>
                    {row.image && (
                      <img
                        className="mt-1 h-[60px] w-[88px] shrink-0 rounded-md border-2 border-border object-cover shadow-hard-xs"
                        src={row.image}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                </Card>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2.5 rounded-lg border-2 bg-card px-4 py-3 shadow-hard">
        <span className="mr-auto text-sm font-semibold" aria-live="polite">
          {status || `${count} selected`}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={count === 0}>
              <DownloadIcon aria-hidden="true" />
              Download
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {DOWNLOADS.map((f) => (
              <DropdownMenuItem key={f.ext} onSelect={() => download(f)}>
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" disabled={count === 0} onClick={() => void copy()}>
          {status.startsWith('Copied') ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          Copy list
        </Button>
      </div>
    </div>
  );
}
