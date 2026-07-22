import { DismissableLayerBranch } from "@radix-ui/react-dismissable-layer"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp, X } from "lucide-react"
import * as React from "react"

import { font } from "../../tokens/font.ts"
import { zIndex } from "../../tokens/zIndex.ts"
import { cn } from "../../utils/cn.ts"
import { Text } from "../text/text.tsx"

const SelectRoot = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectPortal = SelectPrimitive.Portal

export type SelectContentProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>

interface SelectTriggerSurfaceProps extends React.ComponentPropsWithoutRef<"div"> {
  size?: "small" | "default"
  trailing?: React.ReactNode
}

const SelectTriggerSurface = React.forwardRef<HTMLDivElement, SelectTriggerSurfaceProps>(
  ({ className, children, size = "default", trailing, ...props }, ref) => (
    <div
      ref={ref}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Radix Trigger uses asChild and merges combobox role, aria-*, and keyboard behavior onto this div.
      tabIndex={0}
      className={cn(
        "flex w-full min-w-0 cursor-pointer items-center justify-between rounded-lg border border-input bg-transparent text-left",
        "px-3 shadow-none ring-offset-background placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50 [&>span]:line-clamp-1",
        font.size.h5,
        {
          "h-7 py-1": size === "small",
          "h-9 py-2": size === "default",
        },
        className,
      )}
      {...props}
    >
      {children}
      {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </div>
  ),
)
SelectTriggerSurface.displayName = "SelectTriggerSurface"

interface SelectTriggerProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> {
  size?: "small" | "default"
  removable?: boolean
  onRemove?: () => void
}

const SelectTrigger = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Trigger>, SelectTriggerProps>(
  ({ className, children, size = "default", removable, onRemove, ...props }, ref) => (
    // `asChild` avoids invalid HTML (button inside button): Radix merges trigger behavior onto this div.
    <SelectPrimitive.Trigger ref={ref} asChild {...props}>
      <SelectTriggerSurface
        size={size}
        className={className}
        trailing={
          removable ? (
            <button
              type="button"
              aria-label="Clear selection"
              className="cursor-pointer rounded-sm opacity-50 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onRemove?.()
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : (
            <SelectPrimitive.Icon asChild>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </SelectPrimitive.Icon>
          )
        }
      >
        {children}
      </SelectTriggerSurface>
    </SelectPrimitive.Trigger>
  ),
)
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

interface SelectValueProps {
  selected: unknown
  options: readonly { label: string; value: unknown; icon?: React.ReactNode }[]
  placeholder?: string
  placeholderIcon?: React.ReactNode
}

function SelectValue({ selected, options, placeholder, placeholderIcon }: SelectValueProps) {
  const match = options.find((o) => String(o.value) === String(selected))
  if (!match) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-hidden text-left text-muted-foreground">
        {placeholderIcon ? <span className="shrink-0">{placeholderIcon}</span> : null}
        <Text.H5 color="foregroundMuted" noWrap ellipsis>
          {placeholder ?? "Select an option"}
        </Text.H5>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-hidden text-left">
      {match.icon ? <span className="shrink-0">{match.icon}</span> : null}
      <Text.H5 display="block" noWrap ellipsis>
        {match.label}
      </Text.H5>
    </div>
  )
}

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  SelectContentProps & { readonly viewportConstrained?: boolean }
>(({ className, children, position = "popper", viewportConstrained = true, ...props }, ref) => (
  <SelectPortal>
    <DismissableLayerBranch>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative max-h-72 min-w-32 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          !viewportConstrained && "max-h-none overflow-visible",
          zIndex.dropdown,
          className,
        )}
        position={position}
        {...props}
      >
        {viewportConstrained ? (
          <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
            <ChevronUp className="h-4 w-4" />
          </SelectPrimitive.ScrollUpButton>
        ) : null}
        <SelectPrimitive.Viewport
          className={cn(
            viewportConstrained && "p-1",
            position === "popper" &&
              (viewportConstrained
                ? "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)"
                : "w-full min-w-(--radix-select-trigger-width)"),
          )}
          {...(viewportConstrained ? {} : { style: { overflow: "visible", flex: "none" } })}
        >
          {children}
        </SelectPrimitive.Viewport>
        {viewportConstrained ? (
          <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
            <ChevronDown className="h-4 w-4" />
          </SelectPrimitive.ScrollDownButton>
        ) : null}
      </SelectPrimitive.Content>
    </DismissableLayerBranch>
  </SelectPortal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

interface SelectItemProps extends Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>, "disabled"> {
  icon?: React.ReactNode
  disabled?: boolean | undefined
}

const SelectItem = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Item>, SelectItemProps>(
  ({ className, children, icon, disabled, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex w-full cursor-default select-none items-center justify-start rounded-md py-1.5 pl-3 pr-8 text-left text-sm outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...(disabled ? { disabled: true } : {})}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {icon && <span className="pr-2">{icon}</span>}
      <span className="flex-1 text-left">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </span>
    </SelectPrimitive.Item>
  ),
)
SelectItem.displayName = SelectPrimitive.Item.displayName

export { SelectRoot, SelectGroup, SelectTrigger, SelectTriggerSurface, SelectValue, SelectContent, SelectItem }
