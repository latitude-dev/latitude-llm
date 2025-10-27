import { useMemo } from 'react'
import { UseLogHistoryParams } from '../DocumentParams/HistoryLogParams/useLogHistoryParams'

const MAX_HISTORY_LOGS = 100

export function useLimitedHistoryLogs(data: UseLogHistoryParams) {
  const limitedCount = useMemo(() => {
    return data.count > MAX_HISTORY_LOGS ? MAX_HISTORY_LOGS : data.count
  }, [data.count])

  const limitedPosition = useMemo(() => {
    return data.position
      ? data.position > MAX_HISTORY_LOGS
        ? MAX_HISTORY_LOGS
        : data.position
      : undefined
  }, [data.position])

  return {
    limitedCount,
    limitedPosition,
  }
}
