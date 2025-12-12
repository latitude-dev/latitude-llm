'use client'

import {
  DeploymentTest,
  ACTIVE_DEPLOYMENT_STATUSES,
} from '@latitude-data/core/schema/models/types/DeploymentTest'
import { useCallback, useMemo } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { createDeploymentTestAction } from '$/actions/deploymentTests/create'
import { pauseDeploymentTestAction } from '$/actions/deploymentTests/pause'
import { resumeDeploymentTestAction } from '$/actions/deploymentTests/resume'
import { stopDeploymentTestAction } from '$/actions/deploymentTests/stop'
import { destroyDeploymentTestAction } from '$/actions/deploymentTests/destroy'
import { updateDeploymentTestAction } from '$/actions/deploymentTests/update'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_DATA = [] as DeploymentTest[]

export default function useDeploymentTests(
  {
    projectId,
    commitId,
    status,
    activeOnly,
  }: {
    projectId?: number
    commitId?: number
    status?: string
    activeOnly?: boolean
  } = {},
  opts: SWRConfiguration & {
    onSuccessCreate?: (test: DeploymentTest) => void
  } = {},
) {
  const { toast } = useToast()
  const { onSuccessCreate } = opts
  const enabled = !!projectId

  const queryParams = new URLSearchParams()
  if (projectId) {
    queryParams.set('projectId', String(projectId))
  }
  if (commitId) {
    queryParams.set('commitId', String(commitId))
  }
  if (status) {
    queryParams.set('status', status)
  }
  const queryString = queryParams.toString()
  const url = enabled
    ? `/api/deployment-tests${queryString ? `?${queryString}` : ''}`
    : undefined

  const fetcher = useFetcher<DeploymentTest[]>(url, {
    fallback: EMPTY_DATA,
  })

  const {
    mutate,
    data: rawData = EMPTY_DATA,
    isValidating,
    isLoading,
    error: swrError,
  } = useSWR<DeploymentTest[]>(
    enabled ? ['deploymentTests', projectId, commitId, status] : undefined,
    fetcher,
    {
      ...opts,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  )

  // Filter to only active tests if requested
  const data = useMemo(() => {
    if (activeOnly) {
      return rawData.filter((test) =>
        ACTIVE_DEPLOYMENT_STATUSES.includes(test.status),
      )
    }
    return rawData
  }, [rawData, activeOnly])

  const { execute: executeCreate, isPending: isCreating } = useLatitudeAction(
    createDeploymentTestAction,
    {
      onSuccess: ({ data: test }) => {
        toast({
          title: 'Test created',
          description: `Deployment test has been created and started`,
        })
        onSuccessCreate?.(test)
        mutate()
      },
      onError: () => {
        toast({
          title: 'Error creating test',
          description: 'Failed to create deployment test',
          variant: 'destructive',
        })
      },
    },
  )

  const { execute: executePause, isPending: isPausing } = useLatitudeAction(
    pauseDeploymentTestAction,
    {
      onSuccess: ({ data: updatedTest }) => {
        mutate(
          (prev) =>
            (prev ?? data)?.map((test) =>
              test.id === updatedTest.id ? updatedTest : test,
            ) ?? [],
          { revalidate: false },
        )
        toast({
          title: 'Test paused',
          description: 'Deployment test has been paused',
        })
      },
      onError: () => {
        toast({
          title: 'Error pausing test',
          description: 'Failed to pause deployment test',
          variant: 'destructive',
        })
      },
    },
  )

  const { execute: executeResume, isPending: isResuming } = useLatitudeAction(
    resumeDeploymentTestAction,
    {
      onSuccess: ({ data: updatedTest }) => {
        mutate(
          (prev) =>
            (prev ?? data)?.map((test) =>
              test.id === updatedTest.id ? updatedTest : test,
            ) ?? [],
          { revalidate: false },
        )
        toast({
          title: 'Test resumed',
          description: 'Deployment test has been resumed',
        })
      },
      onError: () => {
        toast({
          title: 'Error resuming test',
          description: 'Failed to resume deployment test',
          variant: 'destructive',
        })
      },
    },
  )

  const { execute: executeStop, isPending: isStopping } = useLatitudeAction(
    stopDeploymentTestAction,
    {
      onSuccess: ({ data: updatedTest }) => {
        mutate(
          (prev) => {
            const prevData = prev ?? rawData
            // Update the test in the cache
            // If activeOnly is true, the data memo will filter out completed tests automatically
            // If activeOnly is false, we keep the updated test with completed status
            return prevData.map((test) =>
              test.id === updatedTest.id ? updatedTest : test,
            )
          },
          { revalidate: false },
        )
        toast({
          title: 'Test stopped',
          description: 'Deployment test has been completed',
        })
      },
      onError: () => {
        toast({
          title: 'Error stopping test',
          description: 'Failed to stop deployment test',
          variant: 'destructive',
        })
      },
    },
  )

  const { execute: executeUpdate, isPending: isUpdating } = useLatitudeAction(
    updateDeploymentTestAction,
    {
      onSuccess: ({ data: updatedTest }) => {
        mutate(
          (prev) =>
            (prev ?? data)?.map((test) =>
              test.id === updatedTest.id ? updatedTest : test,
            ) ?? [],
          { revalidate: false },
        )
        toast({
          title: 'Test updated',
          description: 'Deployment test configuration has been updated',
        })
      },
      onError: () => {
        toast({
          title: 'Error updating test',
          description: 'Failed to update deployment test configuration',
          variant: 'destructive',
        })
      },
    },
  )

  const { execute: executeDestroy, isPending: isDestroying } =
    useLatitudeAction(destroyDeploymentTestAction, {
      onSuccess: () => {
        toast({
          title: 'Test deleted',
          description: 'Deployment test has been deleted',
        })
        mutate()
      },
      onError: () => {
        toast({
          title: 'Error deleting test',
          description: 'Failed to delete deployment test',
          variant: 'destructive',
        })
      },
    })

  const create = useCallback(
    (input: Parameters<typeof executeCreate>[0]) => {
      return executeCreate(input)
    },
    [executeCreate],
  )

  const pause = useCallback(
    (testUuid: string) => {
      return executePause({ testUuid })
    },
    [executePause],
  )

  const resume = useCallback(
    (testUuid: string) => {
      return executeResume({ testUuid })
    },
    [executeResume],
  )

  const stop = useCallback(
    (testUuid: string) => {
      return executeStop({ testUuid })
    },
    [executeStop],
  )

  const update = useCallback(
    (input: Parameters<typeof executeUpdate>[0]) => {
      return executeUpdate(input)
    },
    [executeUpdate],
  )

  const destroy = useCallback(
    (testUuid: string) => {
      return executeDestroy({ testUuid })
    },
    [executeDestroy],
  )

  return useMemo(
    () => ({
      data,
      isLoading,
      isValidating,
      error: swrError,
      mutate,
      create: {
        execute: create,
        isPending: isCreating,
      },
      pause: {
        execute: pause,
        isPending: isPausing,
      },
      resume: {
        execute: resume,
        isPending: isResuming,
      },
      stop: {
        execute: stop,
        isPending: isStopping,
      },
      update: {
        execute: update,
        isPending: isUpdating,
      },
      destroy: {
        execute: destroy,
        isPending: isDestroying,
      },
    }),
    [
      data,
      isLoading,
      isValidating,
      swrError,
      mutate,
      create,
      isCreating,
      pause,
      isPausing,
      resume,
      isResuming,
      stop,
      isStopping,
      update,
      isUpdating,
      destroy,
      isDestroying,
    ],
  )
}
