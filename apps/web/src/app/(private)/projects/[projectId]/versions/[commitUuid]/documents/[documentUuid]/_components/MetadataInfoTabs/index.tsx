import { forwardRef, ReactNode, useState } from 'react'

import { cn, TabSelector, type TabSelectorOption } from '@latitude-data/web-ui'

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
          'flex flex-col flex-grow flex-shrink-0 min-h-0 bg-background w-auto',
          'border border-border rounded-lg items-center relative',
          className,
        )}
      >
        <div className='pt-6 pb-2 flex flex-row w-full px-4'>
          <div className='flex-1 flex justify-end'>{/* Left spacer */}</div>
          <TabSelector
            options={tabs}
            selected={selectedTab}
            onSelect={setSelectedTab}
          />
          <div className='flex-1 flex justify-end min-h-11 pl-4 pointer-events-none'>
            {tabsActions && <>{tabsActions}</>}
          </div>
        </div>
        <div className='w-full custom-scrollbar overflow-y-auto'>
          <div className='flex px-4 py-5 flex-col gap-4 w-full overflow-x-auto'>
            {children({ selectedTab })}
          </div>
        </div>
        {bottomActions ? (
          <div className='w-full bg-card rounded-b-lg'>{bottomActions}</div>
        ) : null}
      </div>
    )
  },
)
