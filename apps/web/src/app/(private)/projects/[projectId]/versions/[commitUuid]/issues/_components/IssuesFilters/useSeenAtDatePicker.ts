import { useMemo, useCallback } from 'react'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { SafeIssuesParams } from '@latitude-data/constants/issues'
import { DateRange } from '@latitude-data/web-ui/atoms/DatePicker'

export function useSeenAtDatePicker({
  serverParams,
}: {
  serverParams: SafeIssuesParams
}) {
  const { filters, setFilters } = useIssuesParameters((state) => ({
    filters: state.filters,
    setFilters: state.setFilters,
  }))
  const firstSeen = filters.firstSeen ?? serverParams.filters.firstSeen
  const lastSeen = filters.lastSeen ?? serverParams.filters.lastSeen
  const firstSeenDate = firstSeen instanceof Date ? firstSeen : undefined
  const lastSeenDate = lastSeen instanceof Date ? lastSeen : undefined

  const dateWindow: DateRange | undefined = useMemo(
    () =>
      firstSeenDate && lastSeenDate
        ? { from: firstSeenDate, to: lastSeenDate }
        : firstSeenDate
          ? { from: firstSeenDate, to: firstSeenDate }
          : lastSeenDate
            ? { from: lastSeenDate, to: lastSeenDate }
            : undefined,
    [firstSeenDate, lastSeenDate],
  )

  const onDateWindowChange = useCallback(
    (range: DateRange | undefined) => {
      // Convert DateRange back to single Date values
      // If only one date is selected (from without to), treat it as lastSeen filter only
      // This gives "show issues last seen until this date" behavior
      if (range?.from && !range?.to) {
        setFilters({
          firstSeen: undefined,
          lastSeen: range.from,
        })
      } else if (range?.from && range?.to) {
        // Full range: firstSeen represents the start, lastSeen represents the end
        setFilters({
          firstSeen: range.from,
          lastSeen: range.to,
        })
      } else {
        // Clear filters when no date is selected
        setFilters({
          firstSeen: undefined,
          lastSeen: undefined,
        })
      }
    },
    [setFilters],
  )

  return useMemo(
    () => ({
      dateWindow,
      onDateWindowChange,
    }),
    [dateWindow, onDateWindowChange],
  )
}
