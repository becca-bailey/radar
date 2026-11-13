import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A styled native <select>: works in plain form posts with no JavaScript.
 * From .astro files, mark the current <option> with `selected` rather than
 * passing `defaultValue` — the options arrive as pre-rendered HTML.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div data-slot="native-select-wrapper" className="relative w-full">
      <select
        data-slot="native-select"
        className={cn(
          'w-full min-w-0 appearance-none rounded-md border-2 border-input bg-card py-2.5 pr-9 pl-3 font-sans text-base text-foreground shadow-[inset_2px_2px_0_rgb(0_0_0/0.05)] focus-visible:outline-[3px] focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

function NativeSelectOption(props: React.ComponentProps<'option'>) {
  return <option data-slot="native-select-option" {...props} />;
}

export { NativeSelect, NativeSelectOption };
