import * as React from 'react';
import {
  ArchiveRestoreIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  UserPlusIcon,
  UserRoundIcon,
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
import InviteLink from '@/components/InviteLink';

interface Props {
  name: string;
  /** The group page: menu links hang off it, and its forms post to it. */
  home: string;
  /** Your display name in this group ('' for anonymous). */
  myName: string;
  /** The page the menu is on, so its forms land back there. */
  returnPath: string;
  isOwner: boolean;
  /** Owner only: the join URL and who's joined. Null if it didn't load. */
  invite?: { url: string; status: string | null } | null;
  /** Owner only: how many links are removed (the menu item shows when > 0). */
  removedCount?: number;
}

const itemLink = 'text-popover-foreground no-underline hover:no-underline';

type Open = 'invite' | 'name' | 'rename' | null;

/**
 * The three-dot menu next to a group's name: export and your name for
 * everyone; inviting, renaming and removed links for the owner. Settings
 * open in dialogs so the page itself stays about what's shared.
 */
export default function GroupMenu({ name, home, myName, returnPath, isOwner, invite, removedCount = 0 }: Props) {
  const [open, setOpen] = React.useState<Open>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const nameId = React.useId();
  const renameId = React.useId();

  const onOpenChange = (next: boolean) => {
    if (!next) setOpen(null);
  };
  const refocusTrigger = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} variant="ghost" size="icon" aria-label={`Actions for group ${name}`}>
            <MoreHorizontalIcon className="size-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isOwner && (
            <DropdownMenuItem onSelect={() => setOpen('invite')}>
              <UserPlusIcon aria-hidden="true" />
              Invite people
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <a className={itemLink} href={`${home}/export`}>
              <DownloadIcon aria-hidden="true" />
              Export links
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen('name')}>
            <UserRoundIcon aria-hidden="true" />
            Your name here
          </DropdownMenuItem>
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setOpen('rename')}>
                <PencilIcon aria-hidden="true" />
                Rename group
              </DropdownMenuItem>
              {removedCount > 0 && (
                <DropdownMenuItem asChild>
                  <a className={itemLink} href={`${home}/removed`}>
                    <ArchiveRestoreIcon aria-hidden="true" />
                    Removed links ({removedCount})
                  </a>
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isOwner && (
        <Dialog open={open === 'invite'} onOpenChange={onOpenChange}>
          <DialogContent onCloseAutoFocus={refocusTrigger}>
            <DialogHeader>
              <DialogTitle>Invite people</DialogTitle>
              <DialogDescription>
                {invite
                  ? `Anyone with this link can join ${name}.`
                  : "Couldn't load the invite link. Reload the page to try again."}
              </DialogDescription>
            </DialogHeader>
            {invite && <InviteLink url={invite.url} action={home} returnPath={returnPath} status={invite.status} />}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={open === 'name'} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={refocusTrigger}>
          <form className="grid gap-4" method="post" action={home}>
            <input type="hidden" name="_action" value="nickname" />
            <input type="hidden" name="return_path" value={returnPath} />
            <DialogHeader>
              <DialogTitle>Your name here</DialogTitle>
              <DialogDescription>
                Shown on what you share, in this group only. A nickname is fine. Leave it blank to stay anonymous; your
                email is never shown.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                type="text"
                name="display_name"
                defaultValue={myName}
                maxLength={40}
                placeholder="Anonymous"
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {isOwner && (
        <Dialog open={open === 'rename'} onOpenChange={onOpenChange}>
          <DialogContent onCloseAutoFocus={refocusTrigger}>
            <form className="grid gap-4" method="post" action={home}>
              <input type="hidden" name="_action" value="rename" />
              <input type="hidden" name="return_path" value={returnPath} />
              <DialogHeader>
                <DialogTitle>Rename group</DialogTitle>
                <DialogDescription>Members see the new name right away.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor={renameId}>Group name</Label>
                <Input id={renameId} type="text" name="name" defaultValue={name} maxLength={100} required />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit">Rename</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
