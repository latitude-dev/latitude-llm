import { useCallback, useState } from 'react'

import { DatasetVersion, DocumentVersion } from '@latitude-data/core/browser'
import { useCurrentProject } from '@latitude-data/web-ui'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDocumentLogs from '$/stores/documentLogs'
import useDocumentLogWithPaginationPosition, {
  LogWithPosition,
} from '$/stores/documentLogWithPaginationPosition'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'
import { useDefaultLogFilterOptions } from '$/hooks/logFilters/useDefaultLogFilterOptions'

const ONLY_ONE_PAGE = '1'

export function useLogHistoryParams({
  document,
  commitVersionUuid,
  datasetVersion,
}: {
  document: DocumentVersion
  commitVersionUuid: string
  datasetVersion: DatasetVersion
}) {
  const { project } = useCurrentProject()
  const {
    history: { setHistoryLog, logUuid, mapDocParametersToInputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid,
    datasetVersion,
  })

  const filterOptions = useDefaultLogFilterOptions()
  const { data: pagination, isLoading: isLoadingCounter } =
    useDocumentLogsPagination({
      documentUuid: document.documentUuid,
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
      documentLogUuid: logUuid,
      document,
      projectId: project.id,
      filterOptions,
      onFetched: onFetchCurrentLog,
      excludeErrors: true,
    },
  )

  const { data: logs, isLoading: isLoadingLog } = useDocumentLogs({
    documentUuid: position === undefined ? undefined : document.documentUuid,
    filterOptions,
    projectId: project.id,
    page: position === undefined ? undefined : String(position.position),
    pageSize: ONLY_ONE_PAGE,
    excludeErrors: true,
    onFetched: (logs) => {
      const log = logs[0]
      if (!log) return

      mapDocParametersToInputs({ parameters: log.parameters })
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
