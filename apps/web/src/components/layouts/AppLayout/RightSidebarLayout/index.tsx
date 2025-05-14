'use client'

import React, { ReactNode, useCallback, useState } from 'react'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { RightSidebar } from './RightSidebar'
import type { RightSidebarItem, RightSidebarTabs } from './types'
import { DocumentationProvider } from '$/components/Documentation/Provider'
import { DocumentationContent } from '$/components/Documentation'
import LatteButton from '$/components/LatteChat/_components/LatteButton'
import { LatteChat } from '$/components/LatteChat'
import { useDynamicBotEmotion } from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Icons/custom-icons'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

const MIN_SIDEBAR_WIDTH_PX = 400
const COLLAPSED_SIDEBAR_WIDTH_PX = 49

export default function RightSidebarLayout({
  children,
}: {
  children: ReactNode
}) {
  const [selected, setSelected] = useState<RightSidebarTabs>()
  const onOpen = useCallback(() => setSelected('docs'), [])

  const { enabled: latteEnabled } = useFeatureFlag({ featureFlag: 'latte' })
  const { emotion, setEmotion, reactWithEmotion } = useDynamicBotEmotion()

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
                  ...(latteEnabled
                    ? [
                        {
                          value: 'latte',
                          label: 'Latte',
                          icon: ({ isSelected, onClick }) => (
                            <LatteButton
                              emotion={emotion}
                              setEmotion={setEmotion}
                              reactWithEmotion={reactWithEmotion}
                              isSelected={isSelected}
                              onClick={onClick}
                            />
                          ),
                          content: (
                            <LatteChat
                              emotion={emotion}
                              setEmotion={setEmotion}
                              reactWithEmotion={reactWithEmotion}
                            />
                          ),
                        } as RightSidebarItem,
                      ]
                    : []),
                ]}
              />
            </SplitPane.Pane>
          }
        />
      </div>
    </DocumentationProvider>
  )
}
