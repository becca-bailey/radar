import * as React from 'react';
import {
  CheckIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCwIcon,
  Share2Icon,
  Trash2Icon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

/** "Readers", "Readers and Knitters", "Readers, Knitters and Bakers". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

interface Props {
  saveId: string;
  /** Names the save in accessible labels and the delete confirmation. */
  title: string;
  /** The saved page's URL, for the copy-link action. */
  url: string;
  note: string | null;
  /** Archiving failed, so offer to try again. */
  canRetry: boolean;
  /** Active topic filter, so the page returns to the same view. */
  topic?: string | null;
  /** Same-site path to return to after an action (default: home). */
  returnPath?: string | null;
  /** Groups this save is shared to (not removed): the note shows there. */
  sharedIn?: string[];
  /** Groups it can still be shared to; empty hides "Share to a group". */
  shareTo?: { id: string; name: string }[];
  defaultGroupId?: string;
}

/**
 * The three-dot menu on a save: copy the link, edit the note, share to a
 * group, retry a failed archive, delete. Every action is a plain form post
 * (to /api/saves/:id or /api/shares); React only provides the menu and
 * dialogs. Delete has no confirm step: the page offers Undo afterwards.
 */
export default function SaveMenu({
  saveId,
  title,
  url,
  note,
  canRetry,
  topic,
  returnPath,
  sharedIn = [],
  shareTo = [],
  defaultGroupId,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const firstShareable = shareTo.find((g) => g.id === defaultGroupId)?.id ?? shareTo[0]?.id ?? '';
  const [shareGroup, setShareGroup] = React.useState(firstShareable);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const retryForm = React.useRef<HTMLFormElement>(null);
  const deleteForm = React.useRef<HTMLFormElement>(null);
  const noteId = React.useId();
  const shareNoteId = React.useId();
  const shareGroupId = React.useId();
  const shareGroupName = shareTo.find((g) => g.id === shareGroup)?.name ?? 'The group';

  const action = `/api/saves/${saveId}`;
  const hidden = (name: string) => (
    <>
      <input type="hidden" name="action" value={name} />
      <input type="hidden" name="topic" value={topic ?? ''} />
      <input type="hidden" name="return_path" value={returnPath ?? ''} />
    </>
  );

  // The dialogs open from menu items, which unmount with the menu, so send
  // focus back to the three-dot button when a dialog closes.
  const refocusTrigger = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };

  // The menu closes on select, so the trigger icon flashes a check as the
  // copied signal. The textarea fallback covers blocked clipboard APIs.
  const copyLink = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        /* nothing to fall back to */
      }
      ta.remove();
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-2"
            aria-label={`Actions for ${title}`}
          >
            {copied ? (
              <CheckIcon className="size-5" aria-hidden="true" />
            ) : (
              <MoreHorizontalIcon className="size-5" aria-hidden="true" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <LinkIcon aria-hidden="true" />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <PencilIcon aria-hidden="true" />
            {note ? 'Edit note' : 'Add a note'}
          </DropdownMenuItem>
          {shareTo.length > 0 && (
            <DropdownMenuItem onSelect={() => setSharing(true)}>
              <Share2Icon aria-hidden="true" />
              {sharedIn.length > 0 ? 'Share to another group' : 'Share to a group'}
            </DropdownMenuItem>
          )}
          {canRetry && (
            <DropdownMenuItem onSelect={() => retryForm.current?.requestSubmit()}>
              <RotateCwIcon aria-hidden="true" />
              Retry archiving
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => deleteForm.current?.requestSubmit()}>
            <Trash2Icon aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {canRetry && (
        <form ref={retryForm} method="post" action={action} hidden>
          {hidden('retry')}
        </form>
      )}
      <form ref={deleteForm} method="post" action={action} hidden>
        {hidden('delete')}
      </form>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent onCloseAutoFocus={refocusTrigger}>
          <form className="grid gap-4" method="post" action={action}>
            {hidden('edit')}
            <DialogHeader>
              <DialogTitle>{note ? 'Edit note' : 'Add a note'}</DialogTitle>
              <DialogDescription className="wrap-anywhere">{title}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={noteId}>Why you saved it</Label>
              <Input
                id={noteId}
                type="text"
                name="note"
                defaultValue={note ?? ''}
                placeholder="Optional"
                aria-describedby={`${noteId}-where`}
              />
              <p id={`${noteId}-where`} className="m-0 text-[0.8rem] text-muted-foreground">
                {sharedIn.length > 0
                  ? `Visible in ${listNames(sharedIn)}. Editing it changes it there too.`
                  : 'Only you see this, unless you share the save to a group.'}
              </p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Save note</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {shareTo.length > 0 && (
        <Dialog open={sharing} onOpenChange={setSharing}>
          <DialogContent onCloseAutoFocus={refocusTrigger}>
            <form className="grid gap-4" method="post" action="/api/shares">
              <input type="hidden" name="action" value="share" />
              <input type="hidden" name="save_id" value={saveId} />
              <DialogHeader>
                <DialogTitle>Share to a group</DialogTitle>
                <DialogDescription className="wrap-anywhere">{title}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor={shareGroupId}>Group</Label>
                <NativeSelect
                  id={shareGroupId}
                  name="group_id"
                  value={shareGroup}
                  onChange={(e) => setShareGroup(e.currentTarget.value)}
                >
                  {shareTo.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={shareNoteId}>{shareGroupName} will see this note</Label>
                <Input
                  id={shareNoteId}
                  type="text"
                  name="note"
                  defaultValue={note ?? ''}
                  placeholder="Why it's worth reading (optional)"
                />
                <p className="m-0 text-[0.8rem] text-muted-foreground">
                  The link and this note. Never your email, and your name only if you've set one for
                  that group.
                  {sharedIn.length > 0 ? ` It's the same note ${listNames(sharedIn)} sees.` : ''}
                </p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit">Share</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
