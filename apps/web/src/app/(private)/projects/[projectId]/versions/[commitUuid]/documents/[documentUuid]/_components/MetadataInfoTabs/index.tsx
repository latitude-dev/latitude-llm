import { forwardRef, ReactNode, useState } from 'react'

import {
  TabSelector,
  TabSelectorOption,
} from '@latitude-data/web-ui/molecules/TabSelector'
import { DetailsPanel } from '$/components/DetailsPannel'

export const DEFAULT_TABS = [
  { label: 'Metadata', value: 'metadata' },
  { label: 'Messages', value: 'messages' },
]

type RenderProps = { selectedTab: string }
type Props = {
  children: (args: RenderProps) => ReactNode
  tabs?: TabSelectorOption<string>[]
  className?: string
  tabsActions?: ReactNode
  bottomActions?: ReactNode
}
export const MetadataInfoTabs = forwardRef<HTMLDivElement, Props>(
  function MetadataInfoTabs(
    { className, tabs = DEFAULT_TABS, tabsActions, bottomActions, children },
    ref,
  ) {
    const [selectedTab, setSelectedTab] = useState<string>('metadata')
    return (
      <DetailsPanel ref={ref} className={className}>
        <DetailsPanel.Header>
          <div className='flex gap-2 pb-2 justify-center'>
            <TabSelector
              options={tabs}
              selected={selectedTab}
              onSelect={setSelectedTab}
            />
            {tabsActions ? (
              <div className='flex items-center justify-end w-full min-h-11 pointer-events-none'>
                {tabsActions}
              </div>
            ) : null}
          </div>
        </DetailsPanel.Header>

        <DetailsPanel.Body>{children({ selectedTab })}</DetailsPanel.Body>

        {bottomActions ? (
          <DetailsPanel.Footer>{bottomActions}</DetailsPanel.Footer>
        ) : null}
      </DetailsPanel>
    )
  },
)
