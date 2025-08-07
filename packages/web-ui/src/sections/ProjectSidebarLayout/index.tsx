'use client'

import { type ReactNode, useCallback } from 'react'

import { SplitPane } from '../../ds/atoms/SplitPane'

export function buildResizableCookie({ key, width }: { key: string; width: number }): string {
  const base = 'react-resizable-panels'
  const keyName = `${base}:${key}`

  return `${keyName}=${width}`
}

export function ProjectSidebarLayout({
  resizableId,
  children,
  sidebar,
  sidebarWidth,
  minSidebarWidth,
}: {
  resizableId: string
  children: ReactNode
  sidebar: ReactNode
  sidebarWidth: number
  minSidebarWidth: number
}) {
  const onResizeStop = useCallback(
    (width: number) => {
      document.cookie = buildResizableCookie({
        key: resizableId,
        width,
      })
    },
    [resizableId],
  )
  return (
    <SplitPane
      direction='horizontal'
      initialSize={sidebarWidth ?? minSidebarWidth}
      minSize={minSidebarWidth}
      onResizeStop={onResizeStop}
      firstPane={<SplitPane.Pane>{sidebar}</SplitPane.Pane>}
      secondPane={<SplitPane.Pane>{children}</SplitPane.Pane>}
    />
  )
}
