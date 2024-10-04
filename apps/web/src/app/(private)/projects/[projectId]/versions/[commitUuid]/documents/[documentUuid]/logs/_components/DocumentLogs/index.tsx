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
    <div className='flex flex-row w-full h-full gap-4 min-w-[1024px] overflow-x-auto'>
      <div className='flex flex-col flex-grow h-full gap-y-4 min-w-0 lg:w-1/2 2xl:w-2/3'>
        <DocumentLogsTable
          documentLogs={documentLogs}
          selectedLog={selectedLog}
          setSelectedLog={setSelectedLog}
          pagination={pagination}
        />
      </div>
      {selectedLog && (
        <div className='lg:w-1/2 2xl:w-1/3'>
          <DocumentLogInfo
            documentLog={selectedLog}
            providerLogs={providerLogs}
          />
        </div>
      )}
    </div>
  )
}
