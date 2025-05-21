'use client'

import React, { ReactNode, useCallback, useState } from 'react'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { RightSidebar } from './RightSidebar'
import { RightSidebarTabs } from './types'
import { DocumentationProvider } from '$/components/Documentation/Provider'
import { DocumentationContent } from '$/components/Documentation'

const MIN_SIDEBAR_WIDTH_PX = 400
const COLLAPSED_SIDEBAR_WIDTH_PX = 49

export default function RightSidebarLayout({
  children,
}: {
  children: ReactNode
}) {
  const [selected, setSelected] = useState<RightSidebarTabs>()
  const onOpen = useCallback(() => setSelected('docs'), [])

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
                onSelect={setSelected}
                items={[
                  {
                    value: 'docs',
                    label: 'Documentation',
                    icon: 'bookMarked',
                    content: (
                      <DocumentationContent isOpen={selected === 'docs'} />
                    ),
                  },
                ]}
              />
            </SplitPane.Pane>
          }
        />
      </div>
    </DocumentationProvider>
  )
}
