'use client'

import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'

export type TabItem = {
  id: string
  label: string
}

export interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
  children: (activeTab: string) => ReactNode
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  className,
  children,
}: TabsProps) {
  return (
    <div className={cn('flex flex-col border rounded-lg min-w-0', className)}>
      <div className='flex border-b border-border'>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-accent-foreground'
                : 'text-muted-foreground'
            }`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children(activeTab)}
    </div>
  )
}
