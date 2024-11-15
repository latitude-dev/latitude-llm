'use client'

import React, { useState } from 'react'

import { ApiKey, DocumentVersion } from '@latitude-data/core/browser'
import { Tabs, type TabItem } from '@latitude-data/web-ui'

import { APIUsage } from './APIUsage'
import { JavascriptUsage } from './JavascriptUsage'

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
    <Tabs
      tabs={tabs}
      activeTab={activeTab}
      onChange={(tabId) => setActiveTab(tabId)}
    >
      {(activeTab) => (
        <>
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
        </>
      )}
    </Tabs>
  )
}
