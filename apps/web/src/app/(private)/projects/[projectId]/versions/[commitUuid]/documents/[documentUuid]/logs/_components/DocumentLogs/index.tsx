'use client'

import { useState } from 'react'

import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import useProviderLogs from '$/stores/providerLogs'

import { DocumentLogInfo } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'

export function DocumentLogs({
  documentLogs,
  pagination,
}: {
  documentLogs: DocumentLogWithMetadata[]
  pagination: IPagination
}) {
  const [selectedLog, setSelectedLog] = useState<
    DocumentLogWithMetadata | undefined
  >()
  const { data: providerLogs } = useProviderLogs({
    documentLogUuid: selectedLog?.uuid,
  })

  return (
    <div className='flex flex-row w-full h-full gap-4'>
      <div className='flex flex-col flex-grow min-w-0 h-full gap-y-4'>
        <DocumentLogsTable
          documentLogs={documentLogs}
          selectedLog={selectedLog}
          setSelectedLog={setSelectedLog}
          pagination={pagination}
        />
      </div>
      {selectedLog && (
        <DocumentLogInfo
          className='w-80'
          documentLog={selectedLog}
          providerLogs={providerLogs}
        />
      )}
    </div>
  )
}
