import { useCallback, useMemo, useState } from 'react'
import { useDefaultLogFilterOptions } from '$/hooks/logFilters/useDefaultLogFilterOptions'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import useDocumentLogWithPaginationPosition, {
  LogWithPosition,
} from '$/stores/documentLogWithPaginationPosition'
import {
  DocumentVersion,
  EvaluatedDocumentLog,
} from '@latitude-data/core/browser'
import useEvaluatedDocumentLogs from '$/stores/evaluatedDocumentLogs'

const ONLY_ONE_PAGE = '1'

export type OnHistoryFetchedFn = (log: EvaluatedDocumentLog) => void
export function useSerializedLogs({
  document,
  onHistoryFetched,
  logUuid,
}: {
  document: DocumentVersion
  onHistoryFetched: OnHistoryFetchedFn
  logUuid?: string
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const filterOptions = useDefaultLogFilterOptions()
  const { data: pagination, isLoading: isLoadingCounter } =
    useDocumentLogsPagination({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      filterOptions,
      page: '1', // Not used really. This is only for the counter.
      pageSize: ONLY_ONE_PAGE,
      excludeErrors: true,
    })
  const [position, setPosition] = useState<LogWithPosition | undefined>(
    logUuid ? undefined : { position: 1, page: 1 },
  )
  const onFetchCurrentLog = useCallback((data: LogWithPosition) => {
    setPosition(data)
  }, [])
  const { isLoading: isLoadingPosition } = useDocumentLogWithPaginationPosition(
    {
      documentLogUuid: logUuid,
      document,
      projectId: project.id,
      filterOptions,
      onFetched: onFetchCurrentLog,
      excludeErrors: true,
    },
  )

  const { data: logs, isLoading: isLoadingLog } = useEvaluatedDocumentLogs({
    documentUuid: position === undefined ? undefined : document.documentUuid,
    filterOptions,
    projectId: project.id,
    page: position === undefined ? undefined : String(position.position),
    pageSize: ONLY_ONE_PAGE,
    onFetched: (logs) => {
      const log = logs[0]
      if (!log) return

      onHistoryFetched(log)
    },
  })

  const updatePosition = useCallback(
    (position: number) => {
      if (isLoadingLog) return

      setPosition((prev) =>
        prev ? { ...prev, position } : { position, page: 1 },
      )
    },
    [isLoadingLog],
  )

  const onNextPage = useCallback(
    (position: number) => updatePosition(position + 1),
    [updatePosition],
  )

  const onPrevPage = useCallback(
    (position: number) => updatePosition(position - 1),
    [updatePosition],
  )

  const isLoading = isLoadingLog || isLoadingCounter
  const log = logs?.[0]
  return useMemo(
    () => ({
      selectedLog: log,
      isLoadingLog: isLoadingPosition || isLoadingLog,
      isLoading,
      page: position?.page,
      position: position?.position,
      count: pagination?.count ?? 0,
      onNextPage,
      onPrevPage,
    }),
    [
      log,
      isLoading,
      position,
      pagination?.count,
      onNextPage,
      onPrevPage,
      isLoadingLog,
      isLoadingPosition,
    ],
  )
}
