'use client'

import { ComponentProps } from 'react'

import { cn } from '$ui/lib/utils'
import * as ResizablePrimitive from 'react-resizable-panels'

const ResizablePanelGroup = ({
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
      className,
    )}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.PanelResizeHandle>) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      'relative flex w-px items-center justify-center',
      'bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2',
      'data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full',
      'data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1',
      'data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2',
      'data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90',
      'ring-offset-0',
      // NOTE: Force the right cursor for the handle
      'data-[panel-group-direction=horizontal]:!cursor-ew-resize data-[panel-group-direction=vertical]:!cursor-ns-resize',
      'hover:ring-2 hover:ring-accent-foreground hover:bg-accent-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground focus-visible:bg-accent-foreground',
      className,
    )}
    {...props}
  />
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
