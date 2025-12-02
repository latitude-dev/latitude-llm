'use client'

import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'
import { useCallback, useMemo } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { createDeploymentTestAction } from '$/actions/deploymentTests/create'
import { pauseDeploymentTestAction } from '$/actions/deploymentTests/pause'
import { stopDeploymentTestAction } from '$/actions/deploymentTests/stop'
import { destroyDeploymentTestAction } from '$/actions/deploymentTests/destroy'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_DATA = [] as DeploymentTest[]

export default function useDeploymentTests(
  { projectId }: { projectId?: number } = {},
  opts: SWRConfiguration & {
    onSuccessCreate?: (test: DeploymentTest) => void
  } = {},
) {
  const { toast } = useToast()
  const { onSuccessCreate } = opts
  const enabled = !!projectId

  const fetcher = useFetcher<DeploymentTest[]>(
    enabled ? `/api/v3/projects/${projectId}/tests` : undefined,
    {
      fallback: EMPTY_DATA,
    },
  )

  const {
    mutate,
    data = EMPTY_DATA,
    isValidating,
    isLoading,
    error: swrError,
  } = useSWR<DeploymentTest[]>(
    enabled ? ['deploymentTests', projectId] : undefined,
    fetcher,
    opts,
  )

  const { execute: executeCreate, isPending: isCreating } = useLatitudeAction(
    createDeploymentTestAction,
    {
      onSuccess: ({ data: test }) => {
        toast({
          title: 'Test created',
          description: `Deployment test "${test.name}" has been created and started`,
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
      onSuccess: () => {
        toast({
          title: 'Test paused',
          description: 'Deployment test has been paused',
        })
        mutate()
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

  const { execute: executeStop, isPending: isStopping } = useLatitudeAction(
    stopDeploymentTestAction,
    {
      onSuccess: () => {
        toast({
          title: 'Test stopped',
          description: 'Deployment test has been completed',
        })
        mutate()
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

  const stop = useCallback(
    (testUuid: string) => {
      return executeStop({ testUuid })
    },
    [executeStop],
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
      stop: {
        execute: stop,
        isPending: isStopping,
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
      stop,
      isStopping,
      destroy,
      isDestroying,
    ],
  )
}
