'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { WorkspaceLimits } from '@latitude-data/core/browser'
import { compact } from 'lodash-es'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export function useWorkspaceLimitsAdmin(
  { workspaceId }: { workspaceId: number },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.admin.workspaces.detail(workspaceId).limits.root
  const fetcher = useFetcher<WorkspaceLimits>(route, { fallback: null })

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<WorkspaceLimits>(compact(route), fetcher, opts)

  return useMemo(() => ({ data, mutate, ...rest }), [data, mutate, rest])
}
