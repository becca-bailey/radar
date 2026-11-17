import * as React from 'react';
import { CheckIcon, CopyIcon, RotateCcwIcon } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface Props {
  /** The full join URL. */
  url: string;
  /** Where the reset form posts: the group page, which handles `rotate_invite`. */
  action: string;
  /** Where to land after a reset: the page this sits on. */
  returnPath?: string;
  /** Who's joined, under the buttons ("3 members · 1 joined this week"). */
  status?: string | null;
}

const COPIED_MS = 2000;

/**
 * The owner's invite link: the URL, Copy, and Reset, which asks first
 * because it breaks the link everyone already has. No heading of its own:
 * it sits in the group menu's Invite dialog or the new-group prompt.
 */
export default function InviteLink({ url, action, returnPath, status }: Props) {
  const [copied, setCopied] = React.useState<'no' | 'yes' | 'manual'>('no');
  const [resetting, setResetting] = React.useState(false);
  const urlRef = React.useRef<HTMLElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const selectUrl = () => {
    const node = urlRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard access (old browser, insecure origin): select the URL
      // so a long-press or Cmd+C finishes the job.
      selectUrl();
      setCopied('manual');
      return;
    }
    setCopied('yes');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied('no'), COPIED_MS);
  };

  const refocusTrigger = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };

  return (
    <>
      <code
        ref={urlRef}
        className="mt-3 block rounded-md border-2 border-dashed bg-background p-2.5 text-[0.88rem] wrap-anywhere select-all"
      >
        {url}
      </code>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied === 'yes' ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {copied === 'yes' ? 'Copied' : 'Copy link'}
        </Button>
        <Button ref={triggerRef} type="button" variant="ghost" size="sm" onClick={() => setResetting(true)}>
          <RotateCcwIcon aria-hidden="true" />
          Reset link…
        </Button>
        <span className={copied === 'manual' ? 'text-sm text-muted-foreground' : 'sr-only'} aria-live="polite">
          {copied === 'yes' && 'Invite link copied'}
          {copied === 'manual' && 'Couldn’t copy. The link is selected, so copy it from there.'}
        </span>
      </div>
      {status && <p className="m-0 mt-3 text-[0.85rem]">{status}</p>}

      <AlertDialog open={resetting} onOpenChange={setResetting}>
        <AlertDialogContent onCloseAutoFocus={refocusTrigger}>
          <form className="grid gap-4" method="post" action={action}>
            <input type="hidden" name="_action" value="rotate_invite" />
            {returnPath && <input type="hidden" name="return_path" value={returnPath} />}
            <AlertDialogHeader>
              <AlertDialogTitle>Reset the invite link?</AlertDialogTitle>
              <AlertDialogDescription>
                Anyone with the current link won't be able to join. People already in the group stay.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit" variant="destructive">
                Reset link
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
