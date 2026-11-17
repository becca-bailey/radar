import { DownloadIcon, MoreHorizontalIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  name: string;
  /** The group page; menu links hang off it. */
  home: string;
}

/** The three-dot menu next to a group's name. Any member can export. */
export default function GroupMenu({ name, home }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for group ${name}`}>
          <MoreHorizontalIcon className="size-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a className="text-popover-foreground no-underline hover:no-underline" href={`${home}/export`}>
            <DownloadIcon aria-hidden="true" />
            Export links
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
