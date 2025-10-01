'use client'

import React, { ReactNode } from 'react'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { useDocs } from '$/components/Documentation/Provider'
import { DocumentationContent } from '$/components/Documentation'

const MIN_SIDEBAR_WIDTH_PX = 400

export default function DocumentationSidebarLayout({
  children,
}: {
  children: ReactNode
}) {
  const { isOpen } = useDocs()

  return (
    <div className='w-full h-full overflow-hidden relative'>
      <SplitPane
        direction='horizontal'
        dragDisabled={!isOpen}
        forcedSize={isOpen ? undefined : 0}
        reversed
        initialSize={MIN_SIDEBAR_WIDTH_PX}
        minSize={MIN_SIDEBAR_WIDTH_PX}
        firstPane={<SplitPane.Pane>{children}</SplitPane.Pane>}
        secondPane={
          <SplitPane.Pane>
            <DocumentationContent />
          </SplitPane.Pane>
        }
      />
    </div>
  )
}
