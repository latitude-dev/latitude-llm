import { useMemo } from 'react'
import { UseLogHistoryParamsKeyset } from '../../Playground/DocumentParams/HistoryLogParams/useLogHistoryParamsKeyset'

export function useLimitedHistoryLogsKeyset(data: UseLogHistoryParamsKeyset) {
  // With keyset pagination, we no longer need to limit to 100 logs
  // The pagination is efficient and can handle large datasets
  const hasLogs = useMemo(() => {
    return data.hasNext || data.hasPrevious || data.selectedLog
  }, [data.hasNext, data.hasPrevious, data.selectedLog])

  const navigationState = useMemo(() => {
    return {
      canGoNext: data.hasNext,
      canGoPrevious: data.hasPrevious,
      hasCurrentLog: !!data.selectedLog,
    }
  }, [data.hasNext, data.hasPrevious, data.selectedLog])

  return {
    hasLogs,
    navigationState,
  }
}
