'use client'

import React, { useState } from 'react'

import { ApiKey, DocumentVersion } from '@latitude-data/core/browser'

import { APIUsage } from './APIUsage'
import { JavascriptUsage } from './JavascriptUsage'

type TabItem = {
  id: string
  label: string
}

const Tabs: React.FC<{
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
}> = ({ tabs, activeTab, onChange }) => {
  return (
    <div className='flex border-b border-gray-200'>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === tab.id
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground'
          }`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

const tabs: TabItem[] = [
  { id: 'sdk', label: 'Javascript' },
  { id: 'api', label: 'HTTP API' },
]

interface SettingsTabsProps {
  projectId: number
  commitUuid: string
  document: DocumentVersion
  apiKeys: ApiKey[]
  parameters: Set<string>
}

export function SettingsTabs({
  projectId,
  commitUuid,
  document,
  apiKeys,
  parameters,
}: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState('sdk')

  return (
    <div className='flex flex-col gap-4 border rounded-lg min-w-0'>
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId)}
      />
      <div className='p-4'>
        {activeTab === 'sdk' && (
          <JavascriptUsage
            apiKey={apiKeys[0]?.token}
            projectId={projectId}
            commitUuid={commitUuid}
            documentPath={document.path}
            parameters={parameters}
          />
        )}
        {activeTab === 'api' && (
          <APIUsage
            apiKey={apiKeys[0]?.token}
            projectId={projectId}
            commitUuid={commitUuid}
            documentPath={document.path}
            parameters={parameters}
          />
        )}
      </div>
    </div>
  )
}
