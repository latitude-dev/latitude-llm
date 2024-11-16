'use client'

import { useCallback, useRef, useState } from 'react'

import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import {
  TableBlankSlate,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useDocumentLogs, { documentLogPresenter } from '$/stores/documentLogs'
import useProviderLogs from '$/stores/providerLogs'
import { useSearchParams } from 'next/navigation'

import { DocumentLogInfo } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'

const useDocumentLogSocket = (
  documentUuid: string,
  mutate: ReturnType<typeof useDocumentLogs<false>>['mutate'],
) => {
  const onMessage = useCallback(
    (args: EventArgs<'documentLogCreated'>) => {
      if (documentUuid !== args.documentUuid) return

      mutate(
        (data) => {
          if (!data) return [args.documentLogWithMetadata]

          return [
            {
              ...documentLogPresenter(args.documentLogWithMetadata),
              realtimeAdded: true,
            },
            ...data,
          ]
        },
        { revalidate: false },
      )

      setTimeout(() => {
        mutate(
          (data) => {
            if (!data) return data

            return data.map((d) => {
              if (d.uuid === args.documentLogWithMetadata.uuid) {
                return { ...d, realtimeAdded: false }
              }

              return d
            })
          },
          { revalidate: false },
        )
      }, 1000)
    },
    [documentUuid, mutate],
  )

  useSockets({ event: 'documentLogCreated', onMessage })
}

export function DocumentLogs({
  documentLogs: serverDocumentLogs,
  selectedLog: serverSelectedLog,
}: {
  documentLogs: DocumentLogWithMetadataAndError[]
  selectedLog: DocumentLogWithMetadataAndError | undefined
}) {
  const tableRef = useRef<HTMLTableElement>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')
  const document = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const [selectedLog, setSelectedLog] = useState<
    DocumentLogWithMetadataAndError | undefined
  >(serverSelectedLog)
  const { data: providerLogs, isLoading: isProviderLogsLoading } =
    useProviderLogs({
      documentLogUuid: selectedLog?.uuid,
    })
  const { data: documentLogs, mutate } = useDocumentLogs(
    {
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
      page,
      pageSize,
      excludeErrors: false,
    },
    {
      fallbackData: serverDocumentLogs,
    },
  )

  useDocumentLogSocket(document.documentUuid, mutate)

  if (!documentLogs.length) {
    return (
      <TableBlankSlate description='There are no logs for this prompt yet. Logs will appear here when you run the prompt for the first time.' />
    )
  }

  return (
    <div className='flex flex-row flex-grow min-h-0 w-full gap-4 min-w-[1024px] overflow-x-auto'>
      <div className='flex flex-col flex-grow h-full gap-y-4 min-w-0 lg:w-1/2 2xl:w-2/3'>
        <div className='flex-1 mb-6'>
          <DocumentLogsTable
            ref={tableRef}
            documentLogs={documentLogs}
            selectedLog={selectedLog}
            setSelectedLog={setSelectedLog}
          />
        </div>
      </div>
      {selectedLog && (
        <div className='lg:w-1/2 2xl:w-1/3' ref={sidebarWrapperRef}>
          <DocumentLogInfo
            documentLog={selectedLog}
            providerLogs={providerLogs}
            isLoading={isProviderLogsLoading}
            tableRef={tableRef}
            sidebarWrapperRef={sidebarWrapperRef}
          />
        </div>
      )}
    </div>
  )
}
