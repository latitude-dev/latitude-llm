'use client'

import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { drainQueueAction } from '$/actions/admin/workers/drainQueue'
import { removeWorkspaceJobsAction } from '$/actions/admin/workers/removeWorkspaceJobs'
import type {
  QueueStats,
  QueueDetail,
  WorkspaceQueueUsage,
} from '@latitude-data/core/services/workers/inspect'

export function useQueueStats(opts?: SWRConfiguration) {
  const route = ROUTES.api.admin.workers.root
  const fetcher = useFetcher<QueueStats[]>(route)

  const { data = [], mutate, ...rest } = useSWR<QueueStats[]>(route, fetcher, {
    refreshInterval: 5000,
    ...opts,
  })

  return useMemo(
    () => ({ data, mutate, ...rest }),
    [data, mutate, rest],
  )
}

export function useQueueDetail(
  queueName: string | null,
  opts?: SWRConfiguration,
) {
  const route = queueName
    ? ROUTES.api.admin.workers.detail(queueName).root
    : null
  const fetcher = useFetcher<QueueDetail>(route ?? undefined)

  const { data, mutate, ...rest } = useSWR<QueueDetail>(
    route,
    fetcher,
    {
      refreshInterval: 5000,
      ...opts,
    },
  )

  return useMemo(
    () => ({ data, mutate, ...rest }),
    [data, mutate, rest],
  )
}

export function useWorkspaceWorkerUsage(
  workspaceId: number,
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.admin.workers.workspace(workspaceId).root
  const fetcher = useFetcher<WorkspaceQueueUsage[]>(route)

  const { data = [], mutate, ...rest } = useSWR<WorkspaceQueueUsage[]>(
    route,
    fetcher,
    {
      refreshInterval: 10000,
      ...opts,
    },
  )

  return useMemo(
    () => ({ data, mutate, ...rest }),
    [data, mutate, rest],
  )
}

export function useWorkerActions() {
  const { toast } = useToast()

  const { execute: executeDrainQueue, isPending: isDrainingQueue } =
    useLatitudeAction(drainQueueAction, {
      onSuccess: async () => {
        toast({
          title: 'Queue drained',
          description: 'All waiting jobs removed',
        })
      },
    })

  const {
    execute: executeRemoveWorkspaceJobs,
    isPending: isRemovingWorkspaceJobs,
  } = useLatitudeAction(removeWorkspaceJobsAction, {
    onSuccess: async ({ data: result }) => {
      toast({
        title: 'Workspace jobs removed',
        description: `Removed ${result.removed} jobs`,
      })
    },
  })

  const drainQueue = useCallback(
    async (params: { queueName: string }) => {
      return executeDrainQueue(params)
    },
    [executeDrainQueue],
  )

  const removeWorkspaceJobs = useCallback(
    async (params: { workspaceId: number; queueName?: string }) => {
      return executeRemoveWorkspaceJobs(params)
    },
    [executeRemoveWorkspaceJobs],
  )

  return useMemo(
    () => ({
      drainQueue,
      isDrainingQueue,
      removeWorkspaceJobs,
      isRemovingWorkspaceJobs,
    }),
    [
      drainQueue,
      isDrainingQueue,
      removeWorkspaceJobs,
      isRemovingWorkspaceJobs,
    ],
  )
}
