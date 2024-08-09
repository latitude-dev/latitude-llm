'use client'

import { useCallback, useEffect, useState } from 'react'

import type { DocumentLogWithMetadata } from '@latitude-data/core'
import { ProviderLog } from '@latitude-data/core/browser'
import { TabSelector } from '@latitude-data/web-ui'
import { getProviderLogsForDocumentLogAction } from '$/actions/providerLogs/getProviderLogsForDocumentLogAction'
import { useServerAction } from 'zsa-react'

import { DocumentLogMessages } from './Messages'
import { DocumentLogMetadata } from './Metadata'

export function DocumentLogInfo({
  documentLog,
}: {
  documentLog: DocumentLogWithMetadata
}) {
  const [selectedTab, setSelectedTab] = useState<string>('metadata')
  const [providerLogs, setProviderLogs] = useState<ProviderLog[]>()
  const { execute: executeFetchProviderLogsAction } = useServerAction(
    getProviderLogsForDocumentLogAction,
  )

  const fetchProviderLogs = useCallback(
    async (documentLogId: number) => {
      setProviderLogs(undefined)
      const [logs, error] = await executeFetchProviderLogsAction({
        documentLogId,
      })

      if (error) {
        console.error(error)
      }

      setProviderLogs(logs ?? [])
    },
    [executeFetchProviderLogsAction],
  )

  useEffect(() => {
    fetchProviderLogs(documentLog.id)
  }, [documentLog.id, fetchProviderLogs])

  return (
    <div className='w-80 flex-shrink-0 flex flex-col border border-border rounded-lg px-4 pt-6 items-center'>
      <TabSelector
        options={[
          { label: 'Metadata', value: 'metadata' },
          { label: 'Messages', value: 'messages' },
        ]}
        selected={selectedTab}
        onSelect={setSelectedTab}
      />
      <div className='flex relative w-full h-full max-h-full max-w-full overflow-auto'>
        {selectedTab === 'metadata' && (
          <DocumentLogMetadata
            documentLog={documentLog}
            providerLogs={providerLogs}
          />
        )}
        {selectedTab === 'messages' && (
          <DocumentLogMessages providerLogs={providerLogs} />
        )}
      </div>
    </div>
  )
}
