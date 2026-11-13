import * as React from 'react';
import { XIcon } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import OwnerPanel from '@/components/OwnerPanel';
import type { Suggestion, SuggestionsResult } from '@/lib/topicSuggestions';

interface Props {
  groupId: string;
  /** The group page, where "Make it a lens" opens the prefilled form. */
  home: string;
}

/**
 * Owner-only: topics found in what's been shared, each one a click away
 * from becoming a lens. Loads after the page so the clustering and naming
 * never slow it down. Renders nothing if suggestions aren't available.
 */
export default function TopicSuggestions({ groupId, home }: Props) {
  const [result, setResult] = React.useState<SuggestionsResult | 'loading' | 'error'>('loading');
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/groups/${groupId}/topics`)
      .then((res) => (res.ok ? (res.json() as Promise<SuggestionsResult>) : Promise.reject(new Error())))
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setResult('error'));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (result === 'error' || (typeof result === 'object' && result.status === 'unavailable')) return null;

  const dismiss = async (topic: Suggestion) => {
    if (typeof result !== 'object' || result.status !== 'ready') return;
    setResult({ ...result, topics: result.topics.filter((t) => t.key !== topic.key) });
    setStatus(`Dismissed “${topic.name}”. It won't be suggested again.`);
    try {
      await fetch(`/api/groups/${groupId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', key: topic.key }),
      });
    } catch {
      /* the suggestion may come back on the next visit; nothing else breaks */
    }
  };

  const pinHref = (t: Suggestion) =>
    `${home}?new=${encodeURIComponent(t.query)}&name=${encodeURIComponent(t.name)}&suggestion=${encodeURIComponent(t.key)}#new-lens`;

  return (
    <OwnerPanel title="Suggested topics" as="h3" className="mt-6">
      <p className="m-0 mt-2 text-sm text-muted-foreground">
        Found in what's been shared here. Make one a lens and every member sees it as a topic.
      </p>
      {result === 'loading' && (
        <p className="m-0 mt-3 text-sm text-muted-foreground italic">Looking through the shared links…</p>
      )}
      {typeof result === 'object' && result.status === 'too_few' && (
        <p className="m-0 mt-3 text-sm">
          Suggestions start once {result.needed} links are shared here. So far: {result.shared}.
        </p>
      )}
      {typeof result === 'object' && result.status === 'ready' && result.topics.length === 0 && (
        <p className="m-0 mt-3 text-sm">Nothing stands out yet. Suggestions update as more gets shared.</p>
      )}
      {typeof result === 'object' && result.status === 'ready' && result.topics.length > 0 && (
        <ul className="m-0 mt-3 grid list-none gap-2 p-0">
          {result.topics.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border-2 bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 font-semibold wrap-anywhere">{t.name}</p>
                <p className="m-0 text-[0.82rem] text-muted-foreground">
                  {t.count} links
                  {t.newThisWeek > 0 ? ` · ${t.newThisWeek} new this week` : ''} · searches for “{t.query}”
                </p>
              </div>
              <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href={pinHref(t)}>
                Make it a lens
              </a>
              <button
                type="button"
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Dismiss “${t.name}”`}
                title="Dismiss"
                onClick={() => void dismiss(t)}
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" role="status">
        {status}
      </p>
    </OwnerPanel>
  );
}
