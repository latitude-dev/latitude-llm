'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
import { useGenerateDocumentLogDetailUrl } from '$/hooks/useGenerateDocumentLogDetailUrl'
import useDocumentLogs, { documentLogPresenter } from '$/stores/documentLogs'
import useDocumentLogWithPaginationPosition from '$/stores/documentLogWithPaginationPosition'
import useProviderLogs from '$/stores/providerLogs'
import { useSearchParams } from 'next/navigation'

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

/**
 * When this page receive ?logUuid=some-uuid it can happen 2 things
 *
 *   1. The `page=NUMBER` is correct and `selectedLog` is there.
 *   2. There is no `page` param or is incorrect `selectedLog` is not there.
 *
 * We handle (2) here by looking the right page for the `logUuid` in the URL
 */
function useRedirectToLogDetail({
  selectedLog,
  documentLogUuid,
}: {
  selectedLog: DocumentLogWithMetadataAndError | undefined
  documentLogUuid: string | undefined
}) {
  const mounted = useRef(false)
  const { data: position, isLoading } = useDocumentLogWithPaginationPosition({
    documentLogUuid: selectedLog ? undefined : documentLogUuid,
  })
  const { url } = useGenerateDocumentLogDetailUrl({
    documentLogUuid,
    page: position?.page,
  })
  useEffect(() => {
    if (mounted.current) return
    if (isLoading || !url) return

    mounted.current = true
    window.location.href = url
  }, [url, isLoading])
}

export function DocumentLogs({
  documentLogs: serverDocumentLogs,
  selectedLog: serverSelectedLog,
  documentLogUuid,
}: {
  documentLogs: DocumentLogWithMetadataAndError[]
  selectedLog: DocumentLogWithMetadataAndError | undefined
  documentLogUuid: string | undefined
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
    },
    {
      fallbackData: serverDocumentLogs,
    },
  )

  useDocumentLogSocket(document.documentUuid, mutate)
  useRedirectToLogDetail({ selectedLog, documentLogUuid })

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
