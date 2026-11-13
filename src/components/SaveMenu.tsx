import * as React from 'react';
import { MoreHorizontalIcon, PencilIcon, RotateCwIcon, Trash2Icon } from 'lucide-react';

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

interface Props {
  saveId: string;
  /** Names the save in accessible labels and the delete confirmation. */
  title: string;
  note: string | null;
  /** Archiving failed, so offer to try again. */
  canRetry: boolean;
  /** Active topic filter, so the page returns to the same view. */
  topic?: string | null;
  /** Same-site path to return to after an action (default: home). */
  returnPath?: string | null;
}

/**
 * The three-dot menu on a save: edit the note, retry a failed archive,
 * delete. Every action is a plain form post to /api/saves/:id — React only
 * provides the menu and dialogs around them.
 */
export default function SaveMenu({ saveId, title, note, canRetry, topic, returnPath }: Props) {
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const retryForm = React.useRef<HTMLFormElement>(null);
  const noteId = React.useId();

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
            <MoreHorizontalIcon className="size-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <PencilIcon aria-hidden="true" />
            {note ? 'Edit note' : 'Add a note'}
          </DropdownMenuItem>
          {canRetry && (
            <DropdownMenuItem onSelect={() => retryForm.current?.requestSubmit()}>
              <RotateCwIcon aria-hidden="true" />
              Retry archiving
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
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
                placeholder="Optional, shown if shared"
              />
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

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent onCloseAutoFocus={refocusTrigger}>
          <form className="grid gap-4" method="post" action={action}>
            {hidden('delete')}
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this save?</AlertDialogTitle>
              <AlertDialogDescription className="wrap-anywhere">
                “{title}” will be removed from your archive, along with your note. If you shared it
                to a group, it is unshared there too. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit" variant="destructive">
                Delete
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
