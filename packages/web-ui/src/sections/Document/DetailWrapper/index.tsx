'use client'

import { ReactNode, useCallback } from 'react'

import { SplitPane } from '../../../ds/atoms'

export function buildResizableCookie({
  key,
  width,
}: {
  key: string
  width: number
}): string {
  const base = 'react-resizable-panels'
  const keyName = `${base}:${key}`

  return `${keyName}=${width}`
}

export default function DocumentDetailWrapper({
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
      initialWidth={sidebarWidth ?? minSidebarWidth}
      minWidth={minSidebarWidth}
      onResizeStop={onResizeStop}
      leftPane={<SplitPane.Pane>{sidebar}</SplitPane.Pane>}
      rightPane={<SplitPane.Pane>{children}</SplitPane.Pane>}
    />
  )
}
