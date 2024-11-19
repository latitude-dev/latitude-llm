import { forwardRef, ReactNode, useState } from 'react'

import { cn, TabSelector, type TabSelectorOption } from '@latitude-data/web-ui'

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
    {
      className,
      tabs = [
        { label: 'Metadata', value: 'metadata' },
        { label: 'Messages', value: 'messages' },
      ],
      tabsActions,
      bottomActions,
      children,
    },
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
