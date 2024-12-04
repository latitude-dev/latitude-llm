'use client'

import { useCallback, useState } from 'react'

import { DocumentLogFilterOptions } from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import {
  Button,
  TableWithHeader,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'
import { ROUTES } from '$/services/routes'
import useDocumentLogs, { documentLogPresenter } from '$/stores/documentLogs'
import useDocumentLogsAggregations from '$/stores/documentLogsAggregations'
import useEvaluationResultsByDocumentLogs from '$/stores/evaluationResultsByDocumentLogs'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { DocumentLogs } from './DocumentLogs'
import { DocumentLogBlankSlate } from './DocumentLogs/DocumentLogBlankSlate'
import { DocumentLogFilters } from './Filters'

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

export function DocumentLogsPage({
  documentLogs: serverDocumentLogs,
  selectedLog,
  originalSelectedCommitsIds,
  documengLogFilterOptions: initialDocumentLogFilterOptions,
}: {
  documentLogs: DocumentLogWithMetadataAndError[]
  selectedLog?: DocumentLogWithMetadataAndError
  originalSelectedCommitsIds: number[]
  documengLogFilterOptions: DocumentLogFilterOptions
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: showLogFilters } = useFeatureFlag()

  const searchParams = useSearchParams()
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')

  const [documengLogFilterOptions, setDocumentLogFilterOptions] = useState(
    initialDocumentLogFilterOptions,
  )

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

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      {!documentLogs.length && <DocumentLogBlankSlate />}
      {!!documentLogs.length && (
        <TableWithHeader
          title='Logs'
          table={
            <DocumentLogs
              documentLogs={documentLogs}
              selectedLog={selectedLog}
              aggregations={aggregations}
              isAggregationsLoading={isAggregationsLoading}
              evaluationResults={evaluationResults}
              isEvaluationResultsLoading={isEvaluationResultsLoading}
            />
          }
          actions={
            <div className='flex flex-row gap-2'>
              {showLogFilters && (
                <DocumentLogFilters
                  originalSelectedCommitsIds={originalSelectedCommitsIds}
                  documentLogFilterOptions={documengLogFilterOptions}
                  setDocumentLogFilterOptions={setDocumentLogFilterOptions}
                />
              )}
              <Link
                href={
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid })
                    .documents.detail({ uuid: document.documentUuid }).logs
                    .upload
                }
              >
                <Button fancy variant='outline'>
                  Upload logs
                </Button>
              </Link>
            </div>
          }
        />
      )}
    </div>
  )
}
