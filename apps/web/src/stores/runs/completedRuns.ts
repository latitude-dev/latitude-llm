'use client'
import { Project } from '@latitude-data/core/schema/models/types/Project'

import { useMemo } from 'react'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import {
  CompletedRun,
  LogSources,
  RunSourceGroup,
} from '@latitude-data/constants'

import useSWR, { SWRConfiguration } from 'swr'

export function useCompletedRuns(
  {
    project,
    search,
  }: {
    project: Pick<Project, 'id'>
    search?: {
      sourceGroup?: RunSourceGroup
      limit?: number
    }
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<{ items: CompletedRun[]; next: string | null }>(
    ROUTES.api.projects.detail(project.id).runs.completed.detail(search),
  )

  const {
    data = { items: [], next: null },
    mutate,
    isLoading,
  } = useSWR<{ items: CompletedRun[]; next: string | null }>(
    ['completedRuns', project.id, search?.sourceGroup, search?.limit],
    fetcher,
    opts,
  )

  return useMemo(
    () => ({
      data,
      mutate,
      isLoading,
    }),
    [data, mutate, isLoading],
  )
}

export function useCompletedRunsCount(
  {
    project,
    sourceGroup,
    disable = false,
  }: {
    project: Pick<Project, 'id'>
    sourceGroup: RunSourceGroup
    disable?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<Record<LogSources, number>>(
    disable
      ? undefined
      : ROUTES.api.projects.detail(project.id).runs.completed.count,
    {
      serializer: (data) => (data as any)?.countBySource,
      fallback: null,
      searchParams: { sourceGroup },
    },
  )

  const {
    data = undefined,
    mutate,
    ...rest
  } = useSWR<Record<LogSources, number>>(
    ['completedRunsCount', project.id],
    fetcher,
    opts,
  )

  return useMemo(
    () => ({
      data,
      mutate,
      ...rest,
    }),
    [data, mutate, rest],
  )
}
