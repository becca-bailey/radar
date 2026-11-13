import * as React from 'react';
import { EyeOffIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The look for everything only a group's owner sees: a dashed plum panel
 * with an "Only you see this" badge, so it never reads as part of what
 * members get. Renders statically from Astro or inside an island.
 */
export function OwnerBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border-2 bg-candy-plum px-2 text-[0.72rem] font-bold whitespace-nowrap text-foreground',
        className
      )}
    >
      <EyeOffIcon aria-hidden="true" className="size-3" />
      Only you see this
    </span>
  );
}

interface Props {
  title: string;
  /** Heading level: h2 for a page section, h3 inside one. */
  as?: 'h2' | 'h3';
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

export default function OwnerPanel({ title, as: Heading = 'h2', id, className, children }: Props) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-4 rounded-lg border-2 border-dashed border-[color-mix(in_srgb,var(--candy-plum)_75%,var(--ink))] bg-[color-mix(in_srgb,var(--candy-plum)_13%,var(--card))] p-4',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Heading className={cn('m-0', Heading === 'h3' && 'text-[1.1rem]')}>{title}</Heading>
        <OwnerBadge />
      </div>
      {children}
    </section>
  );
}
