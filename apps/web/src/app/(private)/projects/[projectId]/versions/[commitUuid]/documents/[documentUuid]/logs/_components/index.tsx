'use client'
import { useCallback, useMemo, useState } from 'react'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { ROUTES } from '$/services/routes'
import useDocumentLogs, { documentLogPresenter } from '$/stores/documentLogs'
import useDocumentLogsAggregations from '$/stores/documentLogsAggregations'
import useEvaluationResultsByDocumentLogs from '$/stores/evaluationResultsByDocumentLogs'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import {
  DocumentLogFilterOptions,
  ResultWithEvaluation,
  ResultWithEvaluationTmp,
} from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { useCommits } from '$/stores/commitsStore'
import { useDebounce } from 'use-debounce'
import { DocumentLogs } from './DocumentLogs'
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
  const { data: commits } = useCommits()
  const searchParams = useSearchParams()
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')

  const [documentLogFilterOptions, setDocumentLogFilterOptions] = useState(
    initialDocumentLogFilterOptions,
  )
  const [debouncedFilterOptions] = useDebounce(documentLogFilterOptions, 500)
  const { data: documentLogs, mutate } = useDocumentLogs(
    {
      documentUuid: document.documentUuid,
      projectId: project.id,
      filterOptions: debouncedFilterOptions,
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
      documentUuid: commits ? document.documentUuid : undefined,
      filterOptions: debouncedFilterOptions,
      projectId: project.id,
    })

  const { data: resultsV1, isLoading: isEvaluationResultsV1Loading } =
    useEvaluationResultsByDocumentLogs({
      documentLogIds: documentLogs.map((l) => l.id),
    })
  const evaluationResultsV1 = useMemo(
    () =>
      documentLogs.reduce(
        (acc, log) => ({
          ...acc,
          ...(resultsV1[log.id] ? { [log.uuid]: resultsV1[log.id]! } : {}),
        }),
        {} as Record<string, ResultWithEvaluation[]>,
      ),
    [documentLogs, resultsV1],
  )

  const { data: evaluationResultsV2, isLoading: isEvaluationResultsV2Loading } =
    useEvaluationResultsV2ByDocumentLogs({
      project: project,
      commit: commit,
      document: document,
      documentLogUuids: documentLogs.map((l) => l.uuid),
    })

  const evaluationResults = useMemo<
    Record<string, ResultWithEvaluationTmp[]>
  >(() => {
    let evaluationResults: Record<string, ResultWithEvaluationTmp[]> =
      Object.fromEntries(
        Object.entries(evaluationResultsV1).map(([documentLog, results]) => [
          documentLog,
          results.map((result) => ({ ...result, version: 'v1' as const })),
        ]),
      )

    Object.entries(evaluationResultsV2).forEach(([documentLog, results]) => {
      const resultsV2 = results.map((result) => ({
        ...result,
        version: 'v2' as const,
      }))
      if (evaluationResults[documentLog]) {
        evaluationResults[documentLog] = [
          ...evaluationResults[documentLog],
          ...resultsV2,
        ]
      } else {
        evaluationResults[documentLog] = resultsV2
      }
    })

    return evaluationResults
  }, [evaluationResultsV1, evaluationResultsV2])

  useDocumentLogSocket(document.documentUuid, mutate)

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Logs'
        actions={
          <>
            <DocumentLogFilters
              originalSelectedCommitsIds={originalSelectedCommitsIds}
              filterOptions={documentLogFilterOptions}
              onFiltersChanged={setDocumentLogFilterOptions}
            />
            <Link
              href={
                ROUTES.projects
                  .detail({ id: project.id })
                  .commits.detail({ uuid: commit.uuid })
                  .documents.detail({ uuid: document.documentUuid }).logs.upload
              }
            >
              <Button fancy variant='outline' ellipsis>
                Upload logs
              </Button>
            </Link>
          </>
        }
        table={
          <DocumentLogs
            documentLogFilterOptions={debouncedFilterOptions}
            documentLogs={documentLogs}
            selectedLog={selectedLog}
            aggregations={aggregations}
            isAggregationsLoading={isAggregationsLoading}
            evaluationResults={evaluationResults}
            isEvaluationResultsLoading={
              isEvaluationResultsV1Loading || isEvaluationResultsV2Loading
            }
          />
        }
      />
    </div>
  )
}
