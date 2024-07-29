'use client'

import { ReactNode, useLayoutEffect, useState } from 'react'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '$ui/ds/atoms'

const ID_PANEL_GROUP = 'document-detail-panel-group'
const MIN_SIDEBAR_WIDTH_PX = 280
export default function DocumentDetailWrapper({
  children,
  sidebar,
}: {
  children: ReactNode
  sidebar: ReactNode
}) {
  const [minSize, setMinSize] = useState(10)

  useLayoutEffect(() => {
    const panelGroup = document.querySelector<HTMLDivElement>(
      `[data-panel-group-id="${ID_PANEL_GROUP}"]`,
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
  return (
    <ResizablePanelGroup
      autoSaveId={ID_PANEL_GROUP}
      direction='horizontal'
      id={ID_PANEL_GROUP}
    >
      <ResizablePanel
        className='w-72'
        defaultValue={18}
        minSize={minSize}
        maxSize={40}
        order={1}
      >
        {sidebar}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel order={2} defaultSize={82}>
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
