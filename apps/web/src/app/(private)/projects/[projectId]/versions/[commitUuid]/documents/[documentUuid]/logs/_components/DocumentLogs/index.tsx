'use client'

import { useState } from 'react'

import { DocumentLogWithMetadata } from '@latitude-data/core'

import { DocumentLogInfo } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'

export function DocumentLogs({
  documentLogs,
}: {
  documentLogs: DocumentLogWithMetadata[]
}) {
  const [selectedLog, setSelectedLog] =
    useState<DocumentLogWithMetadata | null>(null)

  return (
    <div className='flex flex-row w-full overflow-hidden gap-4'>
      <div className='flex-grow min-w-0'>
        <DocumentLogsTable
          documentLogs={documentLogs}
          selectedLog={selectedLog}
          setSelectedLog={setSelectedLog}
        />
      </div>
      {selectedLog && <DocumentLogInfo documentLog={selectedLog} />}
    </div>
  )
}
