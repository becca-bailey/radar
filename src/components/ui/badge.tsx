import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center rounded-full border-2 border-border font-sans whitespace-nowrap no-underline',
  {
    variants: {
      variant: {
        default: 'bg-secondary px-2 text-sm font-bold text-secondary-foreground',
        // Topic filter chips: quiet until current.
        chip: 'cursor-pointer bg-card px-3 py-1.5 text-[0.82rem] leading-none text-foreground hover:bg-accent hover:text-accent-foreground aria-[current]:bg-primary aria-[current]:font-bold aria-[current]:text-primary-foreground aria-[current]:shadow-hard-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
