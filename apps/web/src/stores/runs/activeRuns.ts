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
  const route = ROUTES.api.projects.detail(project.id).runs.active.root
  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (search?.page) params.set('page', search.page.toString())
    if (search?.pageSize) params.set('pageSize', search.pageSize.toString())
    if (search?.sourceGroup) {
      params.append('sourceGroup', search.sourceGroup)
    }
    return params.toString()
  }, [search])
  const fetcher = useFetcher<ActiveRun[]>(`${route}?${query}`)

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

      mutate()
    },
    [mutate, realtime],
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
  const route = ROUTES.api.projects.detail(project.id).runs.active.count
  const fetcher = useFetcher<Record<LogSources, number>>(route, {
    serializer: (data) => (data as any)?.countBySource,
    fallback: null,
  })

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<Record<LogSources, number>>('activeRunsCount', fetcher, opts)

  const onMessage = useCallback(
    (args: EventArgs<'runStatus'>) => {
      if (!realtime) return
      if (!args) return
      if (args.projectId !== project.id) return

      mutate()
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
