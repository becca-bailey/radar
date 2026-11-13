import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'my-4 rounded-md border-2 px-4 py-2.5 font-semibold text-ink shadow-hard [&_a]:text-inherit',
  {
    variants: {
      variant: {
        default: 'bg-candy-lime',
        error: 'bg-candy-pink',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      // Errors interrupt; confirmations ("Saved.") are announced politely.
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Alert, alertVariants };
