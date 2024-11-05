import { forwardRef, ReactNode, useState } from 'react'

import { cn, TabSelector, TabSelectorOption } from '@latitude-data/web-ui'

type RenderProps = { selectedTab: string }
type Props = {
  children: (args: RenderProps) => ReactNode
  tabs?: TabSelectorOption<string>[]
  className?: string
}
export const MetadataInfoTabs = forwardRef<HTMLDivElement, Props>(
  function MetadataInfoTabs(
    {
      className,
      tabs = [
        { label: 'Metadata', value: 'metadata' },
        { label: 'Messages', value: 'messages' },
      ],
      children,
    },
    ref,
  ) {
    const [selectedTab, setSelectedTab] = useState<string>('metadata')
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col flex-grow min-h-0 bg-background',
          'border border-border rounded-lg items-center relative',
          className,
        )}
      >
        <div className='pt-6 pb-2'>
          <TabSelector
            options={tabs}
            selected={selectedTab}
            onSelect={setSelectedTab}
          />
        </div>
        <div className='w-full custom-scrollbar overflow-y-auto'>
          <div className='flex px-4 py-5 flex-col gap-4 w-full overflow-x-auto'>
            {children({ selectedTab })}
          </div>
        </div>
      </div>
    )
  },
)
