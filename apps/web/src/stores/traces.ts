'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { AssembledTrace } from '@latitude-data/core/constants'

export function useTrace(
  {
    traceId,
  }: {
    traceId: string
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<AssembledTrace>(
    ROUTES.api.traces.detail(traceId).root,
    { fallback: null },
  )

  const {
    data = undefined,
    isLoading,
    mutate,
  } = useSWR<AssembledTrace>(traceId, fetcher, opts)

  return useMemo(() => ({ data, isLoading, mutate }), [data, isLoading, mutate])
}
