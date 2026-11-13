import * as React from 'react';
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';

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
  lensId: string;
  name: string;
  query: string;
}

/**
 * The three-dot menu on a lens: edit its name or search, or delete it.
 * Both are plain form posts to /api/lenses/:id, like SaveMenu.
 */
export default function LensMenu({ lensId, name, query }: Props) {
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const nameId = React.useId();
  const queryId = React.useId();
  const action = `/api/lenses/${lensId}`;

  const refocusTrigger = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} variant="ghost" size="icon" aria-label={`Actions for lens ${name}`}>
            <MoreHorizontalIcon className="size-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <PencilIcon aria-hidden="true" />
            Edit lens
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2Icon aria-hidden="true" />
            Delete lens
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent onCloseAutoFocus={refocusTrigger}>
          <form className="grid gap-4" method="post" action={action}>
            <input type="hidden" name="action" value="edit" />
            <DialogHeader>
              <DialogTitle>Edit lens</DialogTitle>
              <DialogDescription>Changing the search re-runs it across your whole archive.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={nameId}>Name</Label>
              <Input id={nameId} type="text" name="name" defaultValue={name} maxLength={60} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={queryId}>Search for</Label>
              <Input id={queryId} type="text" name="query" defaultValue={query} maxLength={200} required />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Save lens</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent onCloseAutoFocus={refocusTrigger}>
          <form className="grid gap-4" method="post" action={action}>
            <input type="hidden" name="action" value="delete" />
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this lens?</AlertDialogTitle>
              <AlertDialogDescription className="wrap-anywhere">
                “{name}” will be removed from Explore. Your saves stay in your archive.
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
