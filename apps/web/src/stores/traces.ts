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
    traceId?: string | null
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<AssembledTrace>(
    traceId ? ROUTES.api.traces.detail(traceId).root : undefined,
    { fallback: null },
  )

  const {
    data = undefined,
    isLoading,
    mutate,
  } = useSWR<AssembledTrace>(traceId, fetcher, {
    ...opts,
    dedupingInterval: opts?.dedupingInterval ?? 5000, // Prevent duplicate requests within 5s
    revalidateOnFocus: false, // Prevent refetch on tab focus
  })

  return useMemo(() => ({ data, isLoading, mutate }), [data, isLoading, mutate])
}
