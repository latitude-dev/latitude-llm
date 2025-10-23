'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { RealtimeToggle } from '$/components/RealtimeToggle'
import { ROUTES } from '$/services/routes'
import { useCommits } from '$/stores/commitsStore'
import useDocumentLogs, { documentLogPresenter } from '$/stores/documentLogs'
import useDocumentLogsAggregations from '$/stores/documentLogsAggregations'
import useDocumentLogsLimited from '$/stores/documentLogsLimited'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  DocumentLogFilterOptions,
  DocumentLogWithMetadataAndError,
} from '@latitude-data/core/constants'
import { DocumentLogsLimitedView } from '@latitude-data/core/schema/models/types/DocumentLog'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { DocumentLogs } from './DocumentLogs'
import { DocumentLogFilters } from './Filters'

const useDocumentLogSocket = (
  documentUuid: string,
  mutate: ReturnType<typeof useDocumentLogs<false>>['mutate'],
  realtimeEnabled: boolean,
) => {
  const onMessage = useCallback(
    (args: EventArgs<'documentLogCreated'>) => {
      if (!realtimeEnabled) return
      if (documentUuid !== args.documentUuid) return

      mutate(
        (data) => {
          if (!data) return [args.documentLogWithMetadata]

          return [
            {
              ...documentLogPresenter<false>(args.documentLogWithMetadata),
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
    [documentUuid, mutate, realtimeEnabled],
  )

  useSockets({ event: 'documentLogCreated', onMessage })
}

export function DocumentLogsPage({
  documentLogs: serverDocumentLogs,
  selectedLog,
  originalSelectedCommitsIds,
  documentLogFilterOptions: initialDocumentLogFilterOptions,
  limitedView,
}: {
  documentLogs: DocumentLogWithMetadataAndError[]
  selectedLog?: DocumentLogWithMetadataAndError
  originalSelectedCommitsIds: number[]
  documentLogFilterOptions: DocumentLogFilterOptions
  limitedView?: DocumentLogsLimitedView
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { data: commits } = useCommits()
  const searchParams = useSearchParams()
  const page = searchParams.get('page')
  const pageSize = searchParams.get('pageSize')
  const from = searchParams.get('from')
  const [documentLogFilterOptions, setDocumentLogFilterOptions] = useState(
    initialDocumentLogFilterOptions,
  )
  const [debouncedFilterOptions] = useDebounce(documentLogFilterOptions, 500)
  const { data: documentLogsNormal, mutate: mutateNormal } = useDocumentLogs(
    {
      documentUuid: document.documentUuid,
      projectId: project.id,
      filterOptions: debouncedFilterOptions,
      page,
      pageSize,
      excludeErrors: false,
      disable: !!limitedView,
    },
    { fallbackData: serverDocumentLogs },
  )

  const [limitedCursor, setLimitedCursor] = useState<string | null>(from)
  const { data: documentLogsLimited, mutate: mutateLimited } =
    useDocumentLogsLimited(
      {
        documentUuid: document.documentUuid,
        projectId: project.id,
        from: limitedCursor,
        filters: debouncedFilterOptions,
        disable: !limitedView,
      },
      { fallbackData: { items: serverDocumentLogs, next: null } },
    )

  // Prefetching the next logs
  useDocumentLogsLimited({
    documentUuid: document.documentUuid,
    projectId: project.id,
    from: documentLogsLimited.next,
    filters: debouncedFilterOptions,
    disable: !limitedView,
  })

  const documentLogs = useMemo(() => {
    if (limitedView) return documentLogsLimited.items ?? []
    return documentLogsNormal ?? []
  }, [limitedView, documentLogsLimited, documentLogsNormal])

  const mutate = useMemo(() => {
    if (limitedView) {
      return ((
        fn: (
          data: DocumentLogWithMetadataAndError[] | undefined,
        ) => DocumentLogWithMetadataAndError[] | undefined,
        options?: { revalidate?: boolean },
      ) => {
        return mutateLimited((current) => {
          const result = fn(current?.items)
          return result
            ? { items: result, next: current?.next ?? null }
            : current
        }, options)
      }) as ReturnType<typeof useDocumentLogs<false>>['mutate']
    }
    return mutateNormal
  }, [limitedView, mutateLimited, mutateNormal])

  const { data: aggregationsNormal, isLoading: isAggregationsLoading } =
    useDocumentLogsAggregations({
      documentUuid: commits ? document.documentUuid : undefined,
      filterOptions: debouncedFilterOptions,
      projectId: project.id,
      disable: !!limitedView,
    })

  const aggregations = useMemo(() => {
    if (limitedView) return limitedView
    return aggregationsNormal
  }, [limitedView, aggregationsNormal])

  const { data: evaluationResults, isLoading: isEvaluationResultsV2Loading } =
    useEvaluationResultsV2ByDocumentLogs({
      project: project,
      commit: commit,
      document: document,
      documentLogUuids: documentLogs.map((l) => l.uuid),
    })

  const {
    data: evaluations,
    isLoading: isEvaluationsV2Loading,
    annotateEvaluation,
    isAnnotatingEvaluation,
  } = useEvaluationsV2({ project, commit, document })

  const isEvaluationsLoading =
    isEvaluationResultsV2Loading || isEvaluationsV2Loading

  const [realtimeEnabled, setRealtimeEnabled] = useState(!limitedView)
  useDocumentLogSocket(document.documentUuid, mutate, realtimeEnabled)

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title={
          limitedView ? (
            <Tooltip
              asChild
              trigger={
                <span className='flex flex-row items-center gap-2'>
                  <Text.H4B color='foreground'>Logs</Text.H4B>
                  <span className='flex flex-row items-center gap-1'>
                    <Text.H6 color='foreground'>(limited)</Text.H6>
                    <Icon
                      name='info'
                      size='small'
                      color='foreground'
                      className='flex-shrink-0'
                    />
                  </span>
                </span>
              }
              maxWidth='max-w-[400px]'
              align='center'
              side='top'
            >
              Statistics are limited, approximated, and cannot be filtered due
              to the large number of logs.
            </Tooltip>
          ) : (
            'Logs'
          )
        }
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
            <RealtimeToggle
              enabled={realtimeEnabled}
              setEnabled={setRealtimeEnabled}
            />
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
            isEvaluationsLoading={isEvaluationsLoading}
            evaluations={evaluations}
            annotateEvaluation={annotateEvaluation}
            isAnnotatingEvaluation={isAnnotatingEvaluation}
            limitedView={limitedView}
            limitedCursor={documentLogsLimited.next}
            setLimitedCursor={setLimitedCursor}
          />
        }
      />
    </div>
  )
}
