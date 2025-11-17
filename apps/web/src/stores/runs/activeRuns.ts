'use client'

import { stopRunAction } from '$/actions/runs/stop'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { ActiveRun, LogSources, RunSourceGroup } from '@latitude-data/constants'
import type { Project } from '@latitude-data/core/schema/models/types/Project'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export function useActiveRuns(
  {
    project,
    search,
    realtime = true,
  }: {
    project: Pick<Project, 'id'>
    search?: {
      sourceGroup?: RunSourceGroup
      page?: number
      pageSize?: number
    }
    realtime?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<ActiveRun[]>(
    ROUTES.api.projects.detail(project.id).runs.active.detail(search),
  )

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<ActiveRun[]>(
    [
      'activeRuns',
      project.id,
      search?.sourceGroup,
      search?.page,
      search?.pageSize,
    ],
    fetcher,
    opts,
  )

  const { createStreamHandler, hasActiveStream, createAbortController } =
    useStreamHandler()
  const attachRun = useCallback(
    async ({ runUuid }: { runUuid: string }) => {
      const signal = createAbortController()

      const response = await fetch(
        ROUTES.api.projects.detail(project.id).runs.detail(runUuid).attach,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          signal: signal,
        },
      )

      return createStreamHandler(response, signal)
    },
    [project, createAbortController, createStreamHandler],
  )

  const { execute: executeStopRun, isPending: isStoppingRun } =
    useLatitudeAction(stopRunAction, {
      onSuccess: async () => {
        /* No-op */
      },
    })
  const stopRun = useCallback(
    async (parameters: { runUuid: string }) => {
      return await executeStopRun({ ...parameters, projectId: project.id })
    },
    [project, executeStopRun],
  )

  const onMessage = useCallback(
    (args: EventArgs<'runStatus'>) => {
      if (!realtime) return
      if (!args) return

      mutate(
        (prev) => {
          if (!prev) return prev

          // When the run ended, remove it from the list
          if (args.event === 'runEnded') {
            return prev.filter((run) => run.uuid !== args.run.uuid)
          }

          // Update the run in the list
          // If run is not in the list and page is 1, add it to the beginning of the list
          return [
            ...(search?.page === 1
              ? prev.filter((run) => run.uuid !== args.run.uuid)
              : []),
            ...prev.map((run) =>
              run.uuid === args.run.uuid ? { ...run, ...args.run } : run,
            ),
          ]
        },
        {
          revalidate: false,
        },
      )
    },
    [mutate, realtime, search?.page],
  )
  useSockets({ event: 'runStatus', onMessage })

  return useMemo(
    () => ({
      data,
      mutate,
      attachRun,
      isAttachingRun: hasActiveStream,
      stopRun,
      isStoppingRun,
      ...rest,
    }),
    [data, mutate, attachRun, hasActiveStream, stopRun, isStoppingRun, rest],
  )
}

export function useActiveRunsCount(
  {
    project,
    realtime = true,
  }: {
    project: Pick<Project, 'id'>
    realtime?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<Record<LogSources, number>>(
    ROUTES.api.projects.detail(project.id).runs.active.count,
    {
      serializer: (data) => (data as any)?.countBySource,
      fallback: null,
    },
  )

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<Record<LogSources, number>>(
    ['activeRunsCount', project.id],
    fetcher,
    opts,
  )

  const onMessage = useCallback(
    (args: EventArgs<'runStatus'>) => {
      if (!realtime) return
      if (!args) return
      if (args.projectId !== project.id) return

      mutate(
        (prev) => {
          if (!prev) return prev
          const source = args.run.source
          if (!source) return prev
          const currentCount = prev[source] ?? 0

          // If a new run started, increment the count for the source
          if (args.event === 'runStarted') {
            return {
              ...prev,
              [source]: currentCount + 1,
            }
          }

          // If a run ended, decrement the count for the source
          if (args.event === 'runEnded') {
            return {
              ...prev,
              [source]: currentCount - 1,
            }
          }

          // Ignore any other events
          return prev
        },
        {
          revalidate: false,
        },
      )
    },
    [project, mutate, realtime],
  )
  useSockets({ event: 'runStatus', onMessage })

  return useMemo(
    () => ({
      data,
      mutate,
      ...rest,
    }),
    [data, mutate, rest],
  )
}
