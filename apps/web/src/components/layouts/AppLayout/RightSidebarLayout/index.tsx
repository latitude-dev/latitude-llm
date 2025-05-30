'use client'

import React, { ReactNode, useCallback, useMemo, useState } from 'react'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { RightSidebar } from './RightSidebar'
import type { RightSidebarItem, RightSidebarTabs } from './types'
import { DocumentationProvider } from '$/components/Documentation/Provider'
import { DocumentationContent } from '$/components/Documentation'
import LatteButton from '$/components/LatteChat/_components/LatteButton'
import { LatteChat } from '$/components/LatteChat'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { useDynamicBotEmotion } from '@latitude-data/web-ui/molecules/DynamicBot'

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

  const items = useMemo<RightSidebarItem[]>(
    () => [
      {
        value: 'docs',
        label: 'Documentation',
        icon: 'bookMarked',
        content: <DocumentationContent isOpen={selected === 'docs'} />,
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
              onSelect: () => {
                if (emotion === 'thinking') return
                reactWithEmotion('happy', 2000)
              },
              onUnselect: () => {
                if (emotion === 'thinking') return
                reactWithEmotion('unhappy', 2000)
              },
            } as RightSidebarItem,
          ]
        : []),
    ],
    [latteEnabled, emotion, setEmotion, reactWithEmotion, selected],
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
