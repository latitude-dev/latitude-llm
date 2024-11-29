import { useCallback, useMemo, useState } from 'react'

import { DocumentVersion, LogSources } from '@latitude-data/core/browser'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDocumentLogs from '$/stores/documentLogs'
import useDocumentLogWithPaginationPosition, {
  LogWithPosition,
} from '$/stores/documentLogWithPaginationPosition'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'
import { useCommits } from '$/stores/commitsStore'

const ONLY_ONE_PAGE = '1'
export function useLogHistoryParams({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: commits } = useCommits()
  const {
    mapDocParametersToInputs,
    history: { setHistoryLog, logUuid },
  } = useDocumentParameters({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid,
  })

  const filterOptions = useMemo(() => {
    return {
      commitIds: commits
        ?.filter((c) => !!c.mergedAt || c.uuid === commit.uuid)
        .map((c) => c.id),
      logSources: Object.values(LogSources),
    }
  }, [commits, commit])

  const { data: pagination, isLoading: isLoadingCounter } =
    useDocumentLogsPagination({
      documentUuid: commits ? document.documentUuid : undefined, // Delay the fetch until we have the commits
      projectId: project.id,
      filterOptions,
      page: '1', // Not used really. This is only for the counter.
      pageSize: ONLY_ONE_PAGE,
      excludeErrors: true,
    })

  const [position, setPosition] = useState<LogWithPosition | undefined>(
    logUuid ? undefined : { position: 1, page: 1 },
  )
  const onFetchCurrentLog = useCallback(
    (data: LogWithPosition) => {
      setPosition(data)
    },
    [logUuid],
  )
  const { isLoading: isLoadingPosition } = useDocumentLogWithPaginationPosition(
    {
      documentLogUuid: commits ? logUuid : undefined,
      document,
      projectId: project.id,
      filterOptions,
      onFetched: onFetchCurrentLog,
      excludeErrors: true,
    },
  )

  const { data: logs, isLoading: isLoadingLog } = useDocumentLogs({
    documentUuid: commits && !!position ? document.documentUuid : undefined, // Delay the fetch until we have the commits
    filterOptions,
    projectId: project.id,
    page: position === undefined ? undefined : String(position.position),
    pageSize: ONLY_ONE_PAGE,
    excludeErrors: true,
    onFetched: (logs) => {
      const log = logs[0]
      if (!log) return

      mapDocParametersToInputs({
        source: 'history',
        parameters: log.parameters,
      })
      setHistoryLog(log.uuid)
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
  return {
    selectedLog: log,
    isLoadingLog: isLoadingPosition || isLoadingLog,
    isLoading,
    page: position?.page,
    position: position?.position,
    count: pagination?.count ?? 0,
    onNextPage,
    onPrevPage,
  }
}

export type UseLogHistoryParams = ReturnType<typeof useLogHistoryParams>
