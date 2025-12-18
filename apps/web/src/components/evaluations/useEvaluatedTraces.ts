import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { EvaluatedSpansResponse } from '$/app/api/evaluatedSpans/route'
import { ActualOutputConfiguration } from '@latitude-data/constants'

export function useEvaluatedTraces(
  {
    projectId,
    commitUuid,
    documentUuid,
    configuration,
  }: {
    projectId: number
    commitUuid: string
    documentUuid: string
    configuration: ActualOutputConfiguration
  },
  opts?: SWRConfiguration<EvaluatedSpansResponse>,
) {
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([])
  const [currentCursor, setCurrentCursor] = useState<string | null>(null)
  const configString = useMemo(
    () => JSON.stringify(configuration),
    [configuration],
  )
  const fetcher = useFetcher<EvaluatedSpansResponse>(
    API_ROUTES.evaluatedSpans.root,
    {
      searchParams: compactObject({
        projectId,
        commitUuid,
        documentUuid,
        configuration: configString,
        from: currentCursor ?? undefined,
      }) as Record<string, string>,
    },
  )

  const { data, error, isLoading } = useSWR<EvaluatedSpansResponse>(
    [
      'evaluatedSpans',
      projectId,
      commitUuid,
      documentUuid,
      currentCursor,
      configString,
    ],
    fetcher,
    {
      ...opts,
      keepPreviousData: true,
    },
  )

  const onNextPage = useCallback(() => {
    if (!data?.next || isLoading) return

    setCursorHistory((prev) => [...prev, currentCursor])
    setCurrentCursor(data.next)
  }, [data?.next, isLoading, currentCursor])

  const onPrevPage = useCallback(() => {
    if (cursorHistory.length === 0 || isLoading) return

    const previousCursor = cursorHistory[cursorHistory.length - 1]
    if (previousCursor !== undefined) {
      setCursorHistory((prev) => prev.slice(0, -1))
      setCurrentCursor(previousCursor)
    }
  }, [cursorHistory, isLoading])

  useEffect(() => {
    setCursorHistory([])
    setCurrentCursor(null)
  }, [])

  return useMemo(
    () => ({
      selectedTrace: data?.items[0] ?? null,
      error,
      isLoading,
      onNextPage,
      hasNextPage: !!data?.next && !isLoading,
      onPrevPage,
      hasPrevPage: cursorHistory.length > 0 && !isLoading,
      currentCursor,
      cursorHistoryLength: cursorHistory.length,
    }),
    [
      onNextPage,
      onPrevPage,
      data,
      error,
      isLoading,
      currentCursor,
      cursorHistory.length,
    ],
  )
}
