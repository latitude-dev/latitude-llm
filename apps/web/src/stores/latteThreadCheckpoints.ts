'use client'

import { LatteThreadCheckpoint } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import useSWR from 'swr'
import { ROUTES } from '$/services/routes'
import { useMemo } from 'react'

export default function useLatteThreadCheckpoints({
  threadUuid,
  commitId,
}: {
  threadUuid?: string
  commitId?: number
} = {}) {
  const enabled = !!threadUuid && !!commitId
  const fetcher = useFetcher<LatteThreadCheckpoint[]>(
    enabled
      ? ROUTES.api.latte.threads.detail(threadUuid).checkpoints.root
      : undefined,
    { searchParams: commitId ? { commitId: String(commitId) } : undefined },
  )

  const {
    data = [],
    isValidating,
    isLoading,
    error,
    mutate,
  } = useSWR<LatteThreadCheckpoint[]>(
    enabled ? ['latteThreadCheckpoint', threadUuid, commitId] : undefined,
    fetcher,
  )

  return useMemo(
    () => ({
      data,
      isValidating,
      isLoading,
      error,
      mutate,
    }),
    [data, isValidating, isLoading, error, mutate],
  )
}
