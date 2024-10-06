'use client'

import { useCallback, useState } from 'react'

import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import {
  useCurrentCommit,
  useCurrentDocument,
  useCurrentProject,
} from '@latitude-data/web-ui'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useDocumentLogs, { documentLogPresenter } from '$/stores/documentLogs'
import useProviderLogs from '$/stores/providerLogs'

import { DocumentLogInfo } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'

const useDocumentLogSocket = (
  documentUuid: string,
  mutate: ReturnType<typeof useDocumentLogs>['mutate'],
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
  pagination,
}: {
  documentLogs: DocumentLogWithMetadata[]
  pagination: IPagination
}) {
  const document = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const [selectedLog, setSelectedLog] = useState<
    DocumentLogWithMetadata | undefined
  >()
  const { data: providerLogs } = useProviderLogs({
    documentLogUuid: selectedLog?.uuid,
  })
  const { data: documentLogs, mutate } = useDocumentLogs(
    {
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
      page: pagination.page,
      pageSize: pagination.pageSize,
    },
    {
      fallbackData: serverDocumentLogs,
    },
  )

  useDocumentLogSocket(document.documentUuid, mutate)

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
