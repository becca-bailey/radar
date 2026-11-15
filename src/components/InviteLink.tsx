import * as React from 'react';
import { CheckIcon, CopyIcon, MoreHorizontalIcon, RotateCcwIcon } from 'lucide-react';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  /** The full join URL. */
  url: string;
  /** Where the reset form posts: the group page, which handles `rotate_invite`. */
  action: string;
}

const COPIED_MS = 2000;

/**
 * The owner's invite link: the URL, a Copy button, and a menu holding Reset,
 * which asks first because it breaks the link everyone already has.
 */
export default function InviteLink({ url, action }: Props) {
  const [copied, setCopied] = React.useState(false);
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
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const refocusTrigger = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };

  return (
    <>
      <div className="mt-3 flex items-start gap-2">
        <code
          ref={urlRef}
          className="block min-w-0 flex-1 rounded-md border-2 border-dashed bg-background p-2.5 text-[0.88rem] wrap-anywhere select-all"
        >
          {url}
        </code>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={triggerRef} variant="ghost" size="icon" className="mt-1.5" aria-label="Invite link actions">
              <MoreHorizontalIcon className="size-5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setResetting(true)}>
              <RotateCcwIcon aria-hidden="true" />
              Reset link…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Invite link copied' : ''}
        </span>
      </div>

      <AlertDialog open={resetting} onOpenChange={setResetting}>
        <AlertDialogContent onCloseAutoFocus={refocusTrigger}>
          <form className="grid gap-4" method="post" action={action}>
            <input type="hidden" name="_action" value="rotate_invite" />
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
