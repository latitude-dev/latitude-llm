'use client'

import useFetcher from '$/hooks/useFetcher'
import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
import useSWR, { SWRConfiguration } from 'swr'

export default function useActiveDeploymentTest(
  { projectId, commitId }: { projectId?: number; commitId?: number } = {},
  opts: SWRConfiguration = {},
) {
  const enabled = !!projectId && !!commitId

  const fetcher = useFetcher<DeploymentTest | null>(
    enabled
      ? `/api/projects/${projectId}/active-test?projectId=${projectId}&commitId=${commitId}`
      : undefined,
  )

  const {
    data = null,
    isLoading,
    error,
  } = useSWR<DeploymentTest | null>(
    enabled ? ['activeDeploymentTest', projectId, commitId] : undefined,
    fetcher,
    {
      ...opts,
      revalidateOnFocus: false,
    },
  )

  return { data, isLoading, error }
}
