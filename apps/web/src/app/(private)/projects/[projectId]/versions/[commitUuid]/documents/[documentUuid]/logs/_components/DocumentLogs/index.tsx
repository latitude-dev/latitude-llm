'use client'

import { useState } from 'react'

import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import useProviderLogs from '$/stores/providerLogs'

import { DocumentLogInfo } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'

export function DocumentLogs({
  documentLogs,
}: {
  documentLogs: DocumentLogWithMetadata[]
}) {
  const [selectedLog, setSelectedLog] = useState<
    DocumentLogWithMetadata | undefined
  >()
  const { data: providerLogs } = useProviderLogs({
    documentLogUuid: selectedLog?.uuid,
  })

  return (
    <div className='flex flex-row w-full h-full overflow-hidden gap-4'>
      <div className='flex-grow min-w-0 h-full'>
        <DocumentLogsTable
          documentLogs={documentLogs}
          selectedLog={selectedLog}
          setSelectedLog={setSelectedLog}
        />
      </div>
      {selectedLog && (
        <DocumentLogInfo
          documentLog={selectedLog}
          providerLogs={providerLogs}
        />
      )}
    </div>
  )
}
