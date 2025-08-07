'use client'

import { DocumentationContent } from '$/components/Documentation'
import { DocumentationProvider } from '$/components/Documentation/Provider'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { ReactNode, useCallback, useMemo, useState } from 'react'
import { RightSidebar } from './RightSidebar'
import type { RightSidebarItem, RightSidebarTabs } from './types'

const MIN_SIDEBAR_WIDTH_PX = 400
const COLLAPSED_SIDEBAR_WIDTH_PX = 49

export default function RightSidebarLayout({
  children,
}: {
  children: ReactNode
}) {
  const [selected, setSelected] = useState<RightSidebarTabs>()
  const onOpen = useCallback(() => setSelected('docs'), [])
  const items = useMemo<RightSidebarItem[]>(
    () => [
      {
        value: 'docs',
        label: 'Documentation',
        icon: 'bookMarked',
        content: <DocumentationContent isOpen={selected === 'docs'} />,
      },
    ],
    [selected],
  )

  return (
    <DocumentationProvider onOpen={onOpen}>
      <div className='w-full h-full overflow-hidden relative'>
        <SplitPane
          direction='horizontal'
          dragDisabled={!selected}
          forcedSize={!selected ? COLLAPSED_SIDEBAR_WIDTH_PX : undefined}
          reversed
          initialSize={MIN_SIDEBAR_WIDTH_PX}
          minSize={MIN_SIDEBAR_WIDTH_PX}
          firstPane={<SplitPane.Pane>{children}</SplitPane.Pane>}
          secondPane={
            <SplitPane.Pane>
              <RightSidebar
                selected={selected}
                setSelected={setSelected}
                items={items}
              />
            </SplitPane.Pane>
          }
        />
      </div>
    </DocumentationProvider>
  )
}
