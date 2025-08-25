import type { DocumentLogWithMetadataAndError } from '@latitude-data/core/browser'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

/**
 * Custom hook for managing selected log state with URL synchronization.
 *
 * Uses local state as the source of truth for immediate UI updates, while
 * keeping the URL in sync as a side effect for shareability and browser navigation.
 *
 * @param serverSelectedLog - Initial selected log from server-side rendering
 * @returns Object containing the selected log and setter function
 */
export function useSelectedLogFromUrl({
  serverSelectedLog,
}: {
  serverSelectedLog?: DocumentLogWithMetadataAndError
}) {
  const searchParams = useSearchParams()

  const [selectedLog, setSelectedLog] = useState<DocumentLogWithMetadataAndError | undefined>(
    serverSelectedLog,
  )

  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams.toString())
    if (selectedLog) {
      newSearchParams.set('logUuid', selectedLog.uuid)
    } else {
      newSearchParams.delete('logUuid')
    }

    const newUrl = `?${newSearchParams.toString()}`
    const currentUrl = `?${searchParams.toString()}`

    if (newUrl !== currentUrl) {
      window.history.replaceState(null, '', newUrl)
    }
  }, [selectedLog, searchParams])

  return useMemo(
    () => ({
      selectedLog,
      setSelectedLog,
    }),
    [selectedLog],
  )
}
