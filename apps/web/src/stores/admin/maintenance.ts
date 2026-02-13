'use client'

import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { triggerMaintenanceJobAction } from '$/actions/admin/maintenance/triggerJob'
import type { MaintenanceJobDefinition } from '@latitude-data/core/services/maintenance/registry'
import type { JobInfo } from '@latitude-data/core/services/workers/inspect'

type MaintenanceData = {
  registry: MaintenanceJobDefinition[]
  activeJobs: JobInfo[]
  waitingJobs: JobInfo[]
}

export function useMaintenanceData(opts?: SWRConfiguration) {
  const route = ROUTES.api.admin.maintenance.root
  const fetcher = useFetcher<MaintenanceData>(route)

  const { data, mutate, ...rest } = useSWR<MaintenanceData>(route, fetcher, {
    refreshInterval: 5000,
    ...opts,
  })

  return useMemo(
    () => ({
      registry: data?.registry ?? [],
      activeJobs: data?.activeJobs ?? [],
      waitingJobs: data?.waitingJobs ?? [],
      mutate,
      ...rest,
    }),
    [data, mutate, rest],
  )
}

export function useMaintenanceActions() {
  const { toast } = useToast()

  const { execute: executeTrigger, isPending: isTriggering } =
    useLatitudeAction(triggerMaintenanceJobAction, {
      onSuccess: async ({ data: result }) => {
        toast({
          title: 'Job triggered',
          description: `${result.jobName} enqueued (ID: ${result.jobId})`,
        })
      },
    })

  const triggerJob = useCallback(
    async (params: { jobName: string; params?: Record<string, unknown> }) => {
      return executeTrigger(params)
    },
    [executeTrigger],
  )

  return useMemo(
    () => ({ triggerJob, isTriggering }),
    [triggerJob, isTriggering],
  )
}
