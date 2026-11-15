import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

// Radix opens the menu on pointerdown for every pointer type. That fails on
// touch in two ways:
// - On iOS 27.0.1 Safari a tap on the trigger often sends a click with no
//   pointer events at all, so Radix never opens the menu (RAD-41).
// - On any touch screen, a scroll that starts on the trigger pops it open.
// So the trigger opens on the click for everything except a mouse press:
// touch and pen cancel Radix's pointerdown toggle, and a click without a
// pointerdown opens the menu too. Mouse and keyboard keep Radix's behaviour.
// Related upstream: https://github.com/radix-ui/primitives/pull/4232
interface TapToggle {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The last mouse press on the trigger (event timeStamp), which Radix toggled on. */
  mousePressAt: React.RefObject<number | null>;
}

// A mouse press counts as the one a click completes only for this long, so a
// press whose click never reached the trigger (a drag off it, or a click that
// landed outside once the menu opened) can't swallow a later tap.
const PRESS_TO_CLICK_MS = 5000;

const TapToggleContext = React.createContext<TapToggle | null>(null);

function DropdownMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const mousePressAt = React.useRef<number | null>(null);
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange]
  );
  const tapToggle = React.useMemo(() => ({ open, setOpen, mousePressAt }), [open, setOpen]);

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
        tap.mousePressAt.current = event.pointerType === 'mouse' ? event.timeStamp : null;
        // Radix skips its own toggle when the event is already prevented.
        if (event.pointerType !== 'mouse') event.preventDefault();
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!tap) return;
        // Only a mouse press already toggled the menu (in Radix's pointerdown).
        // Anything else opens here: a touch or pen tap, and a click that
        // arrives with no pointerdown at all, which is what iOS 27 sends.
        // A click that says it came from touch or pen is never the end of a
        // mouse press, whatever was recorded before.
        const clickType = (event.nativeEvent as Partial<PointerEvent>).pointerType;
        const pressAt = tap.mousePressAt.current;
        tap.mousePressAt.current = null;
        const toggledOnPress =
          clickType !== 'touch' &&
          clickType !== 'pen' &&
          pressAt !== null &&
          event.timeStamp - pressAt < PRESS_TO_CLICK_MS;
        // detail is 0 for clicks synthesized from Enter/Space, which Radix
        // already handled on keydown.
        if (!toggledOnPress && event.detail > 0 && !event.defaultPrevented) tap.setOpen(!tap.open);
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
