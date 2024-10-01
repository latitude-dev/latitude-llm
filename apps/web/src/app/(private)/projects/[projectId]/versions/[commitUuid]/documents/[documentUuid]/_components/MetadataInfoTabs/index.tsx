import { ReactNode, useState } from 'react'

import { cn, TabSelector, TabSelectorOption } from '@latitude-data/web-ui'

type RenderProps = { selectedTab: string }
export function MetadataInfoTabs({
  className,
  tabs = [
    { label: 'Metadata', value: 'metadata' },
    { label: 'Messages', value: 'messages' },
  ],
  children,
  beforeTabs,
}: {
  children: (args: RenderProps) => ReactNode
  tabs?: TabSelectorOption<string>[]
  beforeTabs?: ReactNode
  className?: string
}) {
  const [selectedTab, setSelectedTab] = useState<string>('metadata')
  return (
    <div
      className={cn(
        'relative flex-shrink-0 flex flex-col',
        'border border-border rounded-lg items-center',
        className,
      )}
    >
      <div className='pt-6'>
        <TabSelector
          options={tabs}
          selected={selectedTab}
          onSelect={setSelectedTab}
        />
      </div>
      <div className='my-5 px-4 flex flex-col gap-y-5 relative w-full'>
        {beforeTabs}
        <div className='flex flex-col gap-4 w-full overflow-x-auto'>
          {children({ selectedTab })}
        </div>
      </div>
    </div>
  )
}
