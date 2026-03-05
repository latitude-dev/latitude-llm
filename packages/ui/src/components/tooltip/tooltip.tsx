"use client"

import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import type { ReactNode } from "react"
import { forwardRef } from "react"

import { zIndex } from "../../tokens/index.ts"
import { cn } from "../../utils/cn.ts"

const TooltipProvider = TooltipPrimitive.Provider

const TooltipRoot = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        zIndex.tooltip,
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

interface TooltipProps {
  children: ReactNode
  trigger: ReactNode
  asChild?: boolean
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  delayDuration?: number
}

function Tooltip({ children, trigger, asChild = false, side, sideOffset, delayDuration = 250 }: TooltipProps) {
  const contentProps: React.ComponentPropsWithoutRef<typeof TooltipContent> = {}
  if (side !== undefined) contentProps.side = side
  if (sideOffset !== undefined) contentProps.sideOffset = sideOffset

  return (
    <TooltipProvider>
      <TooltipRoot delayDuration={delayDuration}>
        <TooltipTrigger asChild={asChild}>{trigger}</TooltipTrigger>
        <TooltipContent {...contentProps}>{children}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}

export { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent }
