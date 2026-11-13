import * as React from 'react';
import { DownloadIcon, FlagIcon, LogOutIcon, MailPlusIcon, SettingsIcon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  email: string;
  /** Show the admin pages (invites, flag queue). */
  admin?: boolean;
}

// Menu items that are links: keep the menu's look, not the global link style.
const itemLink = 'text-popover-foreground no-underline hover:no-underline';

/**
 * The account menu at the end of the main nav: who you're signed in as,
 * Settings, Export, admin pages, and Sign out. Sign out stays a plain form
 * post to /api/auth/logout; the menu item just submits it.
 */
export default function UserMenu({ email, admin = false }: Props) {
  const logoutForm = React.useRef<HTMLFormElement>(null);
  const initial = (email.trim()[0] ?? '?').toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="grid size-8 cursor-pointer place-items-center rounded-full border-2 border-foreground bg-candy-butter font-sans text-sm font-bold text-ink shadow-hard-xs focus-visible:outline-[3px] focus-visible:outline-offset-1"
          aria-label={`Account menu for ${email}`}
        >
          {initial}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a className={itemLink} href="/settings">
              <SettingsIcon aria-hidden="true" />
              Settings
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a className={itemLink} href="/export">
              <DownloadIcon aria-hidden="true" />
              Export saves
            </a>
          </DropdownMenuItem>
          {admin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a className={itemLink} href="/admin/invites">
                  <MailPlusIcon aria-hidden="true" />
                  Beta invites
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a className={itemLink} href="/admin/flags">
                  <FlagIcon aria-hidden="true" />
                  Flag queue
                </a>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logoutForm.current?.requestSubmit()}>
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <form ref={logoutForm} method="post" action="/api/auth/logout" hidden />
    </>
  );
}
