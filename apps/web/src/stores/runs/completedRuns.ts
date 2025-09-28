'use client'

import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { Project } from '@latitude-data/core/schema/types'
import { CompletedRun } from '@latitude-data/constants'
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
      if (args.projectId !== project.id) return
      if (args.run.endedAt) {
        mutate(
          (prev) => {
            if (!prev) return [args.run] as CompletedRun[]
            const index = prev.findIndex((r) => r.uuid === args.run.uuid)
            if (index === -1) return [args.run, ...prev] as CompletedRun[]
            else return [...prev.slice(0, index), args.run, ...prev.slice(index + 1)] as CompletedRun[] // prettier-ignore
          },
          { revalidate: false },
        )
      } else {
        mutate(
          (prev) =>
            prev?.filter((r) => {
              return r.uuid !== args.run.uuid
            }) ?? [],
          { revalidate: false },
        )
      }
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
  const fetcher = useFetcher<number>(disable ? undefined : route, {
    serializer: (data) => (data as any)?.count,
    fallback: null,
  })

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<number>(compact([route]), fetcher, opts)

  const onMessage = useCallback(
    (args: EventArgs<'runStatus'>) => {
      if (!realtime || disable) return
      if (args.projectId !== project.id) return
      if (!args.run.endedAt) return

      mutate((prev) => (prev ?? 0) + 1, { revalidate: false })
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
