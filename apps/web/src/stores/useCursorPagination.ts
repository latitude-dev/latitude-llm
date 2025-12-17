'use client'

import { useCallback, useMemo, useState } from 'react'

/**
 * Generic cursor-based pagination hook
 * Manages cursor state, history, and navigation for keyset pagination
 */
export interface UseCursorPaginationReturn {
  currentCursor: string | null
  goToNextPage: (nextCursor: string) => void
  goToPrevPage: () => void
  reset: () => void
  hasPrev: boolean
  cursorHistoryLength: number
}

/**
 * Hook for managing cursor-based pagination state
 *
 * @returns Pagination state and navigation functions
 */
export function useCursorPagination(): UseCursorPaginationReturn {
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | null>(null)

  const goToNextPage = useCallback(
    (nextCursor: string) => {
      if (!nextCursor) return
      setCursorHistory((prev) => [...prev, currentCursor])
      setCurrentCursor(nextCursor)
    },
    [currentCursor],
  )

  const goToPrevPage = useCallback(() => {
    if (cursorHistory.length === 0) return
    const previousCursor = cursorHistory[cursorHistory.length - 1]
    if (previousCursor !== undefined) {
      setCursorHistory((prev) => prev.slice(0, -1))
      setCurrentCursor(previousCursor)
    }
  }, [cursorHistory])

  const reset = useCallback(() => {
    setCursorHistory([])
    setCurrentCursor(null)
  }, [])

  return useMemo(
    () => ({
      currentCursor,
      goToNextPage,
      goToPrevPage,
      reset,
      hasPrev: cursorHistory.length > 0,
      cursorHistoryLength: cursorHistory.length,
    }),
    [currentCursor, goToNextPage, goToPrevPage, reset, cursorHistory.length],
  )
}
