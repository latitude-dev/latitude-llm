import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { LogSources } from '@latitude-data/constants'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

type TCount = { count: number }
const EMPTY_COUNT = {
  count: 0,
} satisfies TCount
export function useTracesCountByDocument(
  {
    projectId,
    commitUuid,
    documentUuid,
    logSources,
  }: {
    projectId: number
    commitUuid?: string
    documentUuid?: string
    logSources?: LogSources[]
  },
  swrConfig?: SWRConfiguration<TCount, any>,
) {
  const route = ROUTES.api.traces.countByDocument.root
  const fetcher = useFetcher<TCount>(route, {
    searchParams: compactObject({
      projectId: projectId.toString(),
      commitUuid,
      documentUuid,
      logSources: logSources?.join(','),
    }) as Record<string, string>,
  })
  const key = useMemo(
    () =>
      [projectId, commitUuid, documentUuid, logSources?.join(',')].join('|'),
    [projectId, commitUuid, documentUuid, logSources],
  )
  const { data = EMPTY_COUNT, isLoading } = useSWR<TCount>(
    key,
    fetcher,
    swrConfig,
  )

  return useMemo(
    () => ({
      data,
      isLoading,
    }),
    [data, isLoading],
  )
}
