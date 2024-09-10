import React, { ReactNode, useEffect, useState } from 'react'

import { Text } from '@latitude-data/web-ui'

const className =
  'flex-1 min-h-[450px] min-w-0 rounded-lg border bg-muted flex flex-col'

interface TabsProps {
  children: ReactNode
}

const Tabs: React.FC<TabsProps> = ({ children }) => (
  <div className='flex flex-col h-full'>{children}</div>
)

const TabsList: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className='flex flex-row min-w-0 overflow-auto border-b'>{children}</div>
)

interface TabsTriggerProps {
  value: string
  onClick: (value: string) => void
  isActive: boolean
  children: ReactNode
}

const TabsTrigger: React.FC<TabsTriggerProps> = ({
  value,
  onClick,
  isActive,
  children,
}) => (
  <button
    onClick={() => onClick(value)}
    className={`px-4 py-2 border-b-2 ${
      isActive ? 'border-gray-400' : 'border-transparent hover:border-gray-200'
    }`}
  >
    {children}
  </button>
)

const TabsContent: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className='flex-grow overflow-auto'>{children}</div>
)

export default function EvaluationEditor({
  items,
}: {
  items: {
    uuid: string
    name: string
    type: 'evaluation' | 'template'
    data: any
  }[]
}) {
  const [activeTab, setActiveTab] = useState<string>(items[0]?.uuid ?? '')

  useEffect(() => {
    if (items.length > 0) {
      const activeTabExists = items.some((item) => item?.uuid === activeTab)
      if (!activeTabExists) {
        setActiveTab(items[items.length - 1]!.uuid)
      }
    }
  }, [activeTab, items])

  if (items.length === 0) {
    return (
      <div className={`${className} flex items-center justify-center p-4`}>
        <div className='text-center'>
          <Text.H5>
            Select evaluations or templates to view their content
          </Text.H5>
        </div>
      </div>
    )
  }

  if (items.length === 1) {
    return (
      <div className={className}>
        <textarea
          className='w-full h-full p-4 bg-muted text-foregound text-sm resize-none'
          value={
            items[0]!.type === 'evaluation'
              ? items[0]!.data.metadata.prompt
              : items[0]!.data.prompt
          }
          readOnly
          disabled
        />
      </div>
    )
  }

  return (
    <div className={className}>
      <Tabs>
        <TabsList>
          {items.map((item) => (
            <TabsTrigger
              key={item.uuid}
              value={item.uuid}
              onClick={() => setActiveTab(item.uuid)}
              isActive={activeTab === item.uuid}
            >
              <Text.H5 noWrap ellipsis>
                {item.name}
              </Text.H5>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent>
          {items.map(
            (item) =>
              activeTab === item.uuid && (
                <textarea
                  key={item.uuid}
                  className='w-full h-full p-4 bg-muted text-foregound text-sm resize-none'
                  value={
                    item.type === 'evaluation'
                      ? item.data.metadata.prompt
                      : item.data.prompt
                  }
                  readOnly
                  disabled
                />
              ),
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
