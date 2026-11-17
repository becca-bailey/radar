import * as React from 'react';
import { XIcon } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
 * never slow it down. Renders nothing until there are topics to suggest:
 * not while loading, not before enough is shared, not when nothing stands out.
 */
export default function TopicSuggestions({ groupId, home }: Props) {
  const [topics, setTopics] = React.useState<Suggestion[]>([]);
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/groups/${groupId}/topics`)
      .then((res) => (res.ok ? (res.json() as Promise<SuggestionsResult>) : Promise.reject(new Error())))
      .then((r) => !cancelled && r.status === 'ready' && setTopics(r.topics))
      .catch(() => {
        /* no suggestions; the page is fine without them */
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const dismiss = async (topic: Suggestion) => {
    setTopics((ts) => ts.filter((t) => t.key !== topic.key));
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
    <>
      {topics.length > 0 && (
        <OwnerPanel title="Suggested topics" as="h3" className="mt-6">
          <p className="m-0 mt-2 text-sm text-muted-foreground">
            Found in what's been shared here. Make one a lens and every member sees it as a topic.
          </p>
          <ul className="m-0 mt-3 grid list-none gap-3.5 p-0">
            {topics.map((t) => (
              <li key={t.key}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t.name}</CardTitle>
                    <CardDescription>
                      {t.count} links{t.newThisWeek > 0 ? ` · ${t.newThisWeek} new this week` : ''}
                    </CardDescription>
                    <CardAction>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="-mt-1 -mr-2 text-muted-foreground"
                        aria-label={`Dismiss “${t.name}”`}
                        title="Dismiss"
                        onClick={() => void dismiss(t)}
                      >
                        <XIcon aria-hidden="true" className="size-4" />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <p className="m-0 text-sm wrap-anywhere">Searches for “{t.query}”</p>
                  </CardContent>
                  <CardFooter>
                    <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href={pinHref(t)}>
                      Make it a lens
                    </a>
                  </CardFooter>
                </Card>
              </li>
            ))}
          </ul>
        </OwnerPanel>
      )}
      <p className="sr-only" role="status">
        {status}
      </p>
    </>
  );
}
