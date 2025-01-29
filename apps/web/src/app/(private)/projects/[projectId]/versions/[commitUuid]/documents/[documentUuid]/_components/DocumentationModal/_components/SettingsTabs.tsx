'use client'

import { useState } from 'react'

import { ApiKey, DocumentVersion } from '@latitude-data/core/browser'
import { Tabs, type TabItem } from '@latitude-data/web-ui'

import { APIUsage } from './APIUsage'
import { JavascriptUsage } from './JavascriptUsage'
import { PythonUsage } from './PythonUsage'
import { UsedToolsDoc } from '../index'

const tabs: TabItem[] = [
  { id: 'javascript', label: 'Javascript' },
  { id: 'python', label: 'Python' },
  { id: 'api', label: 'HTTP API' },
]

export function SettingsTabs({
  projectId,
  commitUuid,
  document,
  apiKeys,
  parameters,
  tools,
}: {
  projectId: number
  commitUuid: string
  document: DocumentVersion
  apiKeys: ApiKey[]
  parameters: Set<string>
  tools: UsedToolsDoc[]
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]!.id)

  return (
    <Tabs
      tabs={tabs}
      activeTab={activeTab}
      onChange={(tabId) => setActiveTab(tabId)}
    >
      {(activeTab) => (
        <div className='p-6'>
          {activeTab === 'javascript' && (
            <JavascriptUsage
              apiKey={apiKeys[0]?.token}
              projectId={projectId}
              commitUuid={commitUuid}
              documentPath={document.path}
              parameters={parameters}
              tools={tools}
            />
          )}
          {activeTab === 'python' && (
            <PythonUsage
              apiKey={apiKeys[0]?.token}
              projectId={projectId}
              commitUuid={commitUuid}
              documentPath={document.path}
              parameters={parameters}
              tools={tools}
            />
          )}
          {activeTab === 'api' && (
            <APIUsage
              apiKey={apiKeys[0]?.token}
              projectId={projectId}
              commitUuid={commitUuid}
              documentPath={document.path}
              parameters={parameters}
              tools={tools}
            />
          )}
        </div>
      )}
    </Tabs>
  )
}
