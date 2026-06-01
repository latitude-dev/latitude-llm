import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"
import type { ComponentPropsWithRef, ReactNode } from "react"
import { cn } from "../../utils/cn.ts"

/**
 * Command palette primitives built on `cmdk`, styled to our tokens (the shadcn pattern).
 * `CommandDialog` wraps the list in a centered Radix dialog overlay sitting above the
 * combobox/popover layers (`z-[80]` > tooltip `z-[70]`). The list itself supports groups,
 * async loading states, and full keyboard navigation out of the box.
 */

function Command({ className, ...props }: ComponentPropsWithRef<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground",
        className,
      )}
      {...props}
    />
  )
}

interface CommandDialogProps extends ComponentPropsWithRef<typeof CommandPrimitive> {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Accessible name for the dialog (visually hidden). */
  readonly label?: string
  readonly children: ReactNode
  /** Intercept Escape; call `event.preventDefault()` to keep the dialog open (e.g. to pop a sub-page). */
  readonly onEscapeKeyDown?: (event: KeyboardEvent) => void
}

function CommandDialog({
  open,
  onOpenChange,
  label = "Command palette",
  children,
  onEscapeKeyDown,
  ...props
}: CommandDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          aria-label={label}
          {...(onEscapeKeyDown ? { onEscapeKeyDown } : {})}
          className={cn(
            "fixed top-[14vh] left-1/2 z-[80] w-[min(640px,calc(100vw---spacing(8)))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{label}</DialogPrimitive.Description>
          <Command {...props}>{children}</Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function CommandInput({ className, ...props }: ComponentPropsWithRef<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="flex items-center gap-2 border-b border-border px-4">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({ className, ...props }: ComponentPropsWithRef<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-[min(420px,60vh)] overflow-x-hidden overflow-y-auto overscroll-contain p-1.5", className)}
      {...props}
    />
  )
}

function CommandEmpty({ className, ...props }: ComponentPropsWithRef<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-8 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CommandGroup({ className, ...props }: ComponentPropsWithRef<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

function CommandItem({ className, ...props }: ComponentPropsWithRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  )
}

function CommandLoading({ className, ...props }: ComponentPropsWithRef<typeof CommandPrimitive.Loading>) {
  // cmdk wraps children in an inner `<div aria-hidden>`, so the flex row has to target that
  // child for the spinner + label to sit on one line.
  return (
    <CommandPrimitive.Loading
      data-slot="command-loading"
      className={cn(
        "px-3 py-2 text-sm text-muted-foreground [&>div]:flex [&>div]:items-center [&>div]:gap-2",
        className,
      )}
      {...props}
    />
  )
}

function CommandFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      data-slot="command-footer"
      className={cn(
        "flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
}
