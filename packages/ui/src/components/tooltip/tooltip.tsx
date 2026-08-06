import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import type { ComponentPropsWithoutRef, ElementRef, ReactNode } from "react"
import { forwardRef } from "react"

import type { TextColor } from "../../tokens/colors.ts"
import { zIndex } from "../../tokens/zIndex.ts"
import { cn } from "../../utils/cn.ts"
import { Badge, type BadgeProps } from "../badge/index.tsx"
import { Icon, type IconProps } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"

const TooltipProvider = TooltipPrimitive.Provider

const TooltipRoot = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

export type TooltipVariant = "default" | "destructive" | "inverse" | "ghost"

type ProviderProps = ComponentPropsWithoutRef<typeof TooltipProvider>
type RootProps = ComponentPropsWithoutRef<typeof TooltipRoot>
type ContentProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
  variant?: TooltipVariant
  maxWidth?: string
}

const TooltipContent = forwardRef<ElementRef<typeof TooltipPrimitive.Content>, ContentProps>(
  ({ className, variant = "default", sideOffset = 4, maxWidth = "max-w-72", children, ...props }, ref) => (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "overflow-hidden rounded-md text-foreground px-3 py-3 text-xs animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        maxWidth,
        className,
        zIndex.tooltip,
        {
          "bg-background border": variant === "default",
          "bg-destructive": variant === "destructive",
          "bg-foreground text-background": variant === "inverse",
          "bg-transparent p-0 rounded-none": variant === "ghost",
        },
      )}
      {...props}
    >
      {children}
      {variant !== "ghost" && (
        <TooltipPrimitive.Arrow
          width={11}
          height={6}
          className={cn({
            "fill-background": variant === "default",
            "fill-destructive": variant === "destructive",
            "fill-foreground": variant === "inverse",
          })}
        />
      )}
    </TooltipPrimitive.Content>
  ),
)
TooltipContent.displayName = TooltipPrimitive.Content.displayName

function useTooltipTextContentColor(variant: TooltipVariant): TextColor {
  switch (variant) {
    case "default":
      return "foreground"
    case "destructive":
      return "destructiveForeground"
    case "inverse":
      return "background"
    case "ghost":
      return "foreground"
  }
}

type TooltipProps = ProviderProps &
  RootProps &
  ContentProps & {
    trigger?: ReactNode
    children?: ReactNode
    triggerIcon?: IconProps
    triggerBadge?: BadgeProps
    hideWhenEmpty?: boolean
    asChild?: boolean
  }

// Black tooltip by default. In dark mode, it renders white via the `inverse` variant.
function Tooltip({
  children,
  trigger,
  delayDuration = 200,
  disableHoverableContent,
  open,
  defaultOpen,
  onOpenChange,
  variant = "inverse",
  side,
  sideOffset,
  align,
  alignOffset,
  arrowPadding,
  avoidCollisions,
  collisionBoundary,
  collisionPadding,
  sticky,
  hideWhenDetached,
  updatePositionStrategy,
  maxWidth,
  asChild = false,
  triggerIcon,
  triggerBadge,
  hideWhenEmpty = false,
  className,
}: TooltipProps) {
  const textColor = useTooltipTextContentColor(variant)
  const isChildrenString = typeof children === "string"

  if (hideWhenEmpty && !children) {
    return <>{trigger}</>
  }

  const rootProps: RootProps = { delayDuration }
  if (disableHoverableContent !== undefined) rootProps.disableHoverableContent = disableHoverableContent
  if (open !== undefined) rootProps.open = open
  if (defaultOpen !== undefined) rootProps.defaultOpen = defaultOpen
  if (onOpenChange !== undefined) rootProps.onOpenChange = onOpenChange

  const contentProps: ContentProps = { variant }
  if (maxWidth !== undefined) contentProps.maxWidth = maxWidth
  if (side !== undefined) contentProps.side = side
  if (sideOffset !== undefined) contentProps.sideOffset = sideOffset
  if (align !== undefined) contentProps.align = align
  if (alignOffset !== undefined) contentProps.alignOffset = alignOffset
  if (arrowPadding !== undefined) contentProps.arrowPadding = arrowPadding
  if (avoidCollisions !== undefined) contentProps.avoidCollisions = avoidCollisions
  if (collisionBoundary !== undefined) contentProps.collisionBoundary = collisionBoundary
  if (collisionPadding !== undefined) contentProps.collisionPadding = collisionPadding
  if (sticky !== undefined) contentProps.sticky = sticky
  if (hideWhenDetached !== undefined) contentProps.hideWhenDetached = hideWhenDetached
  if (updatePositionStrategy !== undefined) contentProps.updatePositionStrategy = updatePositionStrategy
  if (className !== undefined) contentProps.className = className

  return (
    <TooltipProvider>
      <TooltipRoot {...rootProps}>
        {!triggerIcon && !triggerBadge ? (
          <TooltipTrigger className="cursor-default" asChild={asChild}>
            {trigger}
          </TooltipTrigger>
        ) : (
          <TooltipTrigger asChild={asChild} className="flex items-center gap-x-2">
            {trigger}
            {triggerBadge ? <Badge {...triggerBadge} /> : null}
            {triggerIcon ? <Icon {...triggerIcon} /> : null}
          </TooltipTrigger>
        )}
        <TooltipPrimitive.Portal>
          <TooltipContent {...contentProps}>
            {isChildrenString ? <Text.H6 color={textColor}>{children}</Text.H6> : children}
          </TooltipContent>
        </TooltipPrimitive.Portal>
      </TooltipRoot>
    </TooltipProvider>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger, useTooltipTextContentColor }
