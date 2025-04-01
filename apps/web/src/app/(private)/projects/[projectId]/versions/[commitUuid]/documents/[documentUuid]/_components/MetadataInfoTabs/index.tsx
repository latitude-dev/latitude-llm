import { forwardRef, ReactNode, useState } from 'react'

import { cn } from '@latitude-data/web-ui/utils'
import {
  TabSelector,
  TabSelectorOption,
} from '@latitude-data/web-ui/molecules/TabSelector'

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
      <div
        ref={ref}
        className={cn(
          'flex flex-col flex-grow min-h-0 bg-background overflow-hidden',
          'border border-border rounded-lg items-center relative',
          className,
        )}
      >
        <div className='pt-6 pb-2 relative flex justify-center w-full'>
          <TabSelector
            options={tabs}
            selected={selectedTab}
            onSelect={setSelectedTab}
          />
          {tabsActions ? (
            <div className='absolute right-4 top-6 flex items-center justify-end w-full min-h-11 pointer-events-none'>
              {tabsActions}
            </div>
          ) : null}
        </div>
        <div className='w-full px-4 pb-5 mt-5 custom-scrollbar scrollable-indicator overflow-auto relative'>
          {children({ selectedTab })}
        </div>
        {bottomActions ? (
          <div className='w-full bg-card rounded-b-lg'>{bottomActions}</div>
        ) : null}
      </div>
    )
  },
)
