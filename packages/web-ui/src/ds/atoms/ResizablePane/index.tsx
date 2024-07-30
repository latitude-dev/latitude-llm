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
      'w-px relative flex items-center justify-center',
      'data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full',
      'data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1',
      'data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2',
      'data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90',
      // NOTE: Force the right cursor for the handle
      'data-[panel-group-direction=horizontal]:!cursor-ew-resize data-[panel-group-direction=vertical]:!cursor-ns-resize',
      className,
    )}
    {...props}
  >
    <div
      className={cn(
        'group/handler',
        'absolute inset-0 w-2 -left-1',
        'duration-200 transition-all flex items-center justify-center',
      )}
    >
      <div
        className={cn(
          'duration-75 transition-all',
          'h-full w-px bg-border',
          'group-hover/handler:w-0.5 group-hover/handler:bg-accent-foreground',
        )}
      />
    </div>
  </ResizablePrimitive.PanelResizeHandle>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
