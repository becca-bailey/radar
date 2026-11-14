import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

// Radix opens the menu on pointerdown for every pointer type. On an iPhone
// with iOS 27.0.1 a tap didn't open it at all, and on any touch screen a
// scroll that starts on the trigger pops it open. So for touch and pen the
// trigger cancels Radix's pointerdown toggle and opens on the tap's click
// instead. Mouse and keyboard keep Radix's behaviour. Upstream fix pending:
// https://github.com/radix-ui/primitives/pull/4232
interface TapToggle {
  open: boolean;
  setOpen: (open: boolean) => void;
  pointerType: React.RefObject<string>;
}

const TapToggleContext = React.createContext<TapToggle | null>(null);

function DropdownMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const pointerType = React.useRef('');
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange]
  );
  const tapToggle = React.useMemo(() => ({ open, setOpen, pointerType }), [open, setOpen]);

  return (
    <TapToggleContext.Provider value={tapToggle}>
      <DropdownMenuPrimitive.Root data-slot="dropdown-menu" open={open} onOpenChange={setOpen} {...props} />
    </TapToggleContext.Provider>
  );
}

function DropdownMenuTrigger({
  onPointerDown,
  onClick,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  const tap = React.useContext(TapToggleContext);

  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (!tap) return;
        tap.pointerType.current = event.pointerType;
        // Radix skips its own toggle when the event is already prevented.
        if (event.pointerType !== 'mouse') event.preventDefault();
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!tap) return;
        const fromTap = tap.pointerType.current !== '' && tap.pointerType.current !== 'mouse';
        tap.pointerType.current = '';
        // detail is 0 for clicks synthesized from Enter/Space, which Radix
        // already handled on keydown.
        if (fromTap && event.detail > 0 && !event.defaultPrevented) tap.setOpen(!tap.open);
      }}
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-40 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border-2 bg-popover p-1 font-sans text-popover-foreground shadow-hard data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: 'default' | 'destructive';
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm font-semibold outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive data-[variant=destructive]:focus:text-card [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('px-2.5 py-1.5 text-xs font-bold text-muted-foreground', className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-0.5 bg-hairline', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
};
