'use client'
import { Project } from '@latitude-data/core/schema/models/types/Project'

import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import {
  CompletedRun,
  LogSources,
  RunSourceGroup,
} from '@latitude-data/constants'

import { compact } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

export function useCompletedRuns(
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
  const route = ROUTES.api.projects.detail(project.id).runs.completed.root
  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (search?.page) params.set('page', search.page.toString())
    if (search?.pageSize) params.set('pageSize', search.pageSize.toString())
    if (search?.sourceGroup) {
      params.append('sourceGroup', search.sourceGroup)
    }
    return params.toString()
  }, [search])
  const fetcher = useFetcher<CompletedRun[]>(`${route}?${query}`)

  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<CompletedRun[]>(compact([route, query]), fetcher, opts)

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
      ...rest,
    }),
    [data, mutate, rest],
  )
}

export function useCompletedRunsCount(
  {
    project,
    realtime = true,
    disable = false,
  }: {
    project: Pick<Project, 'id'>
    realtime?: boolean
    disable?: boolean
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects.detail(project.id).runs.completed.count
  const fetcher = useFetcher<Record<LogSources, number>>(
    disable ? undefined : route,
    {
      serializer: (data) => (data as any)?.countBySource,
      fallback: null,
    },
  )

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<Record<LogSources, number>>(compact([route]), fetcher, opts)

  const onMessage = useCallback(
    (args: EventArgs<'runStatus'>) => {
      if (!realtime || disable) return
      if (!args) return
      if (args.projectId !== project.id) return

      mutate()
    },
    [project, mutate, realtime, disable],
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
