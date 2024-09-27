'use client'

import { useState } from 'react'

import { IPagination } from '@latitude-data/core/lib/buildPagination'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import WebPagination from '$/components/WebPagination'
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
    <div className='flex flex-row w-full h-full overflow-hidden gap-4'>
      <div className='flex flex-col flex-grow min-w-0 h-full gap-y-4'>
        <DocumentLogsTable
          documentLogs={documentLogs}
          selectedLog={selectedLog}
          setSelectedLog={setSelectedLog}
        />
        <WebPagination {...pagination} />
      </div>
      {selectedLog && (
        <div className='w-80 flex-shrink-0 flex flex-col border border-border rounded-lg px-4 pt-6 items-center'>
          <DocumentLogInfo
            key={pagination.currentPage}
            documentLog={selectedLog}
            providerLogs={providerLogs}
          />
        </div>
      )}
    </div>
  )
}
