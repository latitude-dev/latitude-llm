'use client'
import { TabItem, Tabs } from '@latitude-data/web-ui/molecules/Tabs'
import { useMemo, useState } from 'react'
import { UsedToolsDoc } from '../index'
import { APIUsage } from './APIUsage'
import { JavascriptUsage } from './JavascriptUsage'
import { PythonUsage } from './PythonUsage'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { ApiKey } from '@latitude-data/core/schema/models/types/ApiKey'
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

  const tabContents = useMemo(
    () => ({
      javascript: (
        <JavascriptUsage
          apiKey={apiKeys[0]?.token}
          projectId={projectId}
          commitUuid={commitUuid}
          documentPath={document.path}
          parameters={parameters}
          tools={tools}
        />
      ),
      python: (
        <PythonUsage
          apiKey={apiKeys[0]?.token}
          projectId={projectId}
          commitUuid={commitUuid}
          documentPath={document.path}
          parameters={parameters}
          tools={tools}
        />
      ),
      api: (
        <APIUsage
          apiKey={apiKeys[0]?.token}
          projectId={projectId}
          commitUuid={commitUuid}
          documentPath={document.path}
          parameters={parameters}
          tools={tools}
        />
      ),
    }),
    [apiKeys, projectId, commitUuid, document.path, parameters, tools],
  )

  return (
    <Tabs
      tabs={tabs}
      activeTab={activeTab}
      onChange={(tabId) => setActiveTab(tabId)}
    >
      {() => (
        <div className='p-6'>
          <div className={activeTab === 'javascript' ? 'block' : 'hidden'}>
            {tabContents.javascript}
          </div>
          <div className={activeTab === 'python' ? 'block' : 'hidden'}>
            {tabContents.python}
          </div>
          <div className={activeTab === 'api' ? 'block' : 'hidden'}>
            {tabContents.api}
          </div>
        </div>
      )}
    </Tabs>
  )
}
