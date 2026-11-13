import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'w-full min-w-0 rounded-md border-2 border-input bg-card px-3 py-2.5 font-sans text-base text-foreground shadow-[inset_2px_2px_0_rgb(0_0_0/0.05)] placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Input };
