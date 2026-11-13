import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 justify-self-start rounded-full border-2 border-border font-sans whitespace-nowrap no-underline transition-[transform,box-shadow] duration-75 focus-visible:outline-[3px] focus-visible:outline-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary font-bold text-primary-foreground',
        outline: 'bg-card font-semibold text-foreground',
        destructive: 'bg-card font-bold text-destructive',
        ghost:
          'border-transparent font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
      },
      size: {
        default: 'px-5 py-2 text-base',
        sm: 'px-3 py-1 text-sm',
        icon: 'size-8',
      },
    },
    compoundVariants: [
      // Everything but ghost is a "sticker": hard shadow that lifts on hover
      // and presses on click.
      {
        variant: ['default', 'outline', 'destructive'],
        className:
          'shadow-hard hover:-translate-px hover:shadow-hard-lg active:translate-0.5 active:shadow-hard-xs',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
