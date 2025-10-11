import { useCallback, useState } from 'react'

import { useDefaultLogFilterOptions } from '$/hooks/logFilters/useDefaultLogFilterOptions'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDocumentLogsKeyset from '$/stores/documentLogsKeyset'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { DocumentVersion } from '@latitude-data/core/schema/types'

const DEFAULT_LIMIT = 1

export function useLogHistoryParamsKeyset({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
}) {
  const { project } = useCurrentProject()
  const {
    history: { setHistoryLog, logUuid, mapDocParametersToInputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid,
  })

  // Note: If we need to speed up history logs as a best-effort basis, filter by playground logs.
  const filterOptions = useDefaultLogFilterOptions()

  // Cursor-based navigation state
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(
    undefined,
  )
  const [navigationDirection, setNavigationDirection] = useState<
    'next' | 'prev' | undefined
  >(undefined)

  // Fetch logs using keyset pagination
  const {
    data: logs,
    hasNext,
    hasPrevious,
    nextCursor,
    previousCursor,
    isLoading: isLoadingLog,
  } = useDocumentLogsKeyset({
    documentUuid: document.documentUuid,
    filterOptions,
    projectId: project.id,
    after: navigationDirection === 'next' ? currentCursor : undefined,
    before: navigationDirection === 'prev' ? currentCursor : undefined,
    limit: DEFAULT_LIMIT,
    excludeErrors: true,
    onFetched: (result) => {
      const log = result.data?.[0]
      if (!log) return

      mapDocParametersToInputs({ parameters: log.parameters })
      setHistoryLog(log)
    },
  })

  const navigateToNext = useCallback(() => {
    if (!hasNext || !nextCursor || isLoadingLog) return

    setNavigationDirection('next')
    setCurrentCursor(nextCursor)
  }, [hasNext, nextCursor, isLoadingLog])

  const navigateToPrevious = useCallback(() => {
    if (!hasPrevious || !previousCursor || isLoadingLog) return

    setNavigationDirection('prev')
    setCurrentCursor(previousCursor)
  }, [hasPrevious, previousCursor, isLoadingLog])

  const navigateToCursor = useCallback(
    (cursor: string) => {
      if (isLoadingLog) return

      setNavigationDirection(undefined)
      setCurrentCursor(cursor)
    },
    [isLoadingLog],
  )

  const log = logs?.[0]
  return {
    selectedLog: log,
    isLoadingLog,
    hasNext,
    hasPrevious,
    navigateToNext,
    navigateToPrevious,
    navigateToCursor,
    currentCursor,
  }
}

export type UseLogHistoryParamsKeyset = ReturnType<
  typeof useLogHistoryParamsKeyset
>
