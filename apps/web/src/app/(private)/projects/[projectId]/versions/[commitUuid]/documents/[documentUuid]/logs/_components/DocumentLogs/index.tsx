'use client'

import { useCallback, useRef, useState } from 'react'

import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import {
  cn,
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
import useDocumentLogsAggregations from '$/stores/documentLogsAggregations'
import useEvaluationResultsByDocumentLogs from '$/stores/evaluationResultsByDocumentLogs'
import useProviderLogs from '$/stores/providerLogs'
import { useSearchParams } from 'next/navigation'

import { AggregationPanels } from './AggregationPanels'
import { DocumentLogInfo } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'
import { LogsOverTimeChart } from './LogsOverTime'

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
  selectedLog?: DocumentLogWithMetadataAndError
}) {
  const stickyRef = useRef<HTMLTableElement>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement>(null)
  const searchParams = useSearchParams()
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')
  const { document } = useCurrentDocument()
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
  const { data: aggregations, isLoading: isAggregationsLoading } =
    useDocumentLogsAggregations({
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
    })
  const { data: evaluationResults, isLoading: isEvaluationResultsLoading } =
    useEvaluationResultsByDocumentLogs({
      documentLogIds: documentLogs.map((l) => l.id),
    })

  useDocumentLogSocket(document.documentUuid, mutate)

  if (!documentLogs.length) {
    return (
      <TableBlankSlate description='There are no logs for this prompt yet. Logs will appear here when you run the prompt for the first time.' />
    )
  }

  return (
    <div className='flex flex-col flex-grow min-h-0 w-full gap-4'>
      <div className='grid xl:grid-cols-2 gap-4 flex-grow'>
        <LogsOverTimeChart
          documentUuid={document.documentUuid}
          commitUuid={commit.uuid}
          projectId={project.id}
        />
        <AggregationPanels
          aggregations={aggregations}
          isLoading={isAggregationsLoading}
        />
      </div>

      <div
        className={cn('gap-x-4 grid pb-6', {
          'grid-cols-1': !selectedLog,
          'grid-cols-2 xl:grid-cols-[2fr_1fr]': selectedLog,
        })}
      >
        <DocumentLogsTable
          ref={stickyRef}
          documentLogs={documentLogs}
          evaluationResults={evaluationResults}
          selectedLog={selectedLog}
          setSelectedLog={setSelectedLog}
          isLoading={isEvaluationResultsLoading}
        />
        {selectedLog && (
          <div ref={sidebarWrapperRef}>
            <DocumentLogInfo
              documentLog={selectedLog}
              providerLogs={providerLogs}
              evaluationResults={evaluationResults[selectedLog.id]}
              isLoading={isProviderLogsLoading || isEvaluationResultsLoading}
              stickyRef={stickyRef}
              sidebarWrapperRef={sidebarWrapperRef}
              offset={{ top: 12, bottom: 12 }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
