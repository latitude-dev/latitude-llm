'use client'

import { ReactNode, useCallback, useLayoutEffect, useState } from 'react'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '$ui/ds/atoms'

export function buildResizableCookie({
  key,
  sizes,
}: {
  key: string
  sizes?: number[]
}): string {
  const base = 'react-resizable-panels'
  const keyName = `${base}:${key}`

  if (!sizes) return keyName

  return `${keyName}=${JSON.stringify(sizes)}`
}

const MIN_SIDEBAR_WIDTH_PX = 280
const DEFAULT_SIDEBAR_PERCENTAGE = 18
const DEFAULT_MAIN_PERCENTAGE = 82
export default function DocumentDetailWrapper({
  resizableId,
  resizableSizes,
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
  resizableId: string
  resizableSizes: number[] | undefined
}) {
  const [minSize, setMinSize] = useState(10)

  useLayoutEffect(() => {
    const panelGroup = document.querySelector<HTMLDivElement>(
      `[data-panel-group-id="${resizableId}"]`,
    )
    const resizeHandles = document.querySelectorAll<HTMLDivElement>(
      '[data-panel-resize-handle-id]',
    )
    if (!panelGroup || !resizeHandles.length) return

    const observer = new ResizeObserver(() => {
      let width = panelGroup.offsetWidth

      resizeHandles.forEach((resizeHandle) => {
        width -= resizeHandle.offsetWidth
      })

      setMinSize((MIN_SIDEBAR_WIDTH_PX / width) * 100)
    })
    observer.observe(panelGroup)
    resizeHandles.forEach((resizeHandle) => {
      observer.observe(resizeHandle)
    })

    return () => {
      observer.unobserve(panelGroup)
      resizeHandles.forEach((resizeHandle) => {
        observer.unobserve(resizeHandle)
      })
      observer.disconnect()
    }
  }, [])
  const onLayout = useCallback((newSizes: number[]) => {
    document.cookie = buildResizableCookie({
      key: resizableId,
      sizes: newSizes,
    })
  }, [])
  return (
    <ResizablePanelGroup
      id={resizableId}
      direction='horizontal'
      onLayout={onLayout}
    >
      <ResizablePanel
        className='w-72'
        defaultSize={resizableSizes?.[0] ?? DEFAULT_SIDEBAR_PERCENTAGE}
        minSize={minSize}
        maxSize={40}
        order={1}
      >
        {sidebar}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        order={2}
        defaultSize={resizableSizes?.[1] ?? DEFAULT_MAIN_PERCENTAGE}
      >
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
