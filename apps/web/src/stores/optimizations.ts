'use client'

import { cancelOptimizationAction } from '$/actions/optimizations/cancel'
import { startOptimizationAction } from '$/actions/optimizations/start'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import {
  DEFAULT_PAGINATION_SIZE,
  OptimizationConfiguration,
} from '@latitude-data/core/constants'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Optimization } from '@latitude-data/core/schema/models/types/Optimization'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { compact } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration, useSWRConfig } from 'swr'

export function useOptimizations(
  {
    project,
    commit,
    document,
    search = {
      page: 1,
      pageSize: DEFAULT_PAGINATION_SIZE,
    },
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
    search?: {
      page?: number
      pageSize?: number
    }
  },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const { mutate: globalMutate } = useSWRConfig()

  const fetcher = useFetcher<Optimization[]>(
    ROUTES.api.projects
      .detail(project.id)
      .documents.detail(document.documentUuid).optimizations.root,
    {
      searchParams: compactObject({
        page: search?.page?.toString(),
        pageSize: search?.pageSize?.toString(),
      }) as Record<string, string>,
    },
  )

  const {
    data = [],
    isLoading,
    mutate,
  } = useSWR<Optimization[]>(
    compact([
      'optimizations',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
      search?.page?.toString(),
      search?.pageSize?.toString(),
    ]),
    fetcher,
    opts,
  )

  const {
    execute: executeStartOptimization,
    isPending: isStartingOptimization,
  } = useLatitudeAction(startOptimizationAction, {
    onSuccess: async ({ data: { optimization } }) => {
      mutate((prev) => [optimization, ...(prev ?? [])])
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === 'optimizationsCount' &&
          key[1] === project.id &&
          key[2] === commit.uuid &&
          key[3] === document.commitId &&
          key[4] === document.documentUuid,
      )
      toast({
        title: 'Optimization started successfully',
        description: `Optimization started successfully`,
      })
    },
    onError: async (error) => {
      if (error.code !== 'ERROR') return
      toast({
        title: 'Error starting optimization',
        description: error?.message,
        variant: 'destructive',
      })
    },
  })
  const startOptimization = useCallback(
    async ({
      configuration,
      goldsetId,
      evaluationUuid,
    }: {
      configuration: OptimizationConfiguration
      goldsetId?: number
      evaluationUuid: string
    }) => {
      return await executeStartOptimization({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        configuration: configuration,
        evaluationUuid: evaluationUuid,
        goldsetId: goldsetId,
      })
    },
    [project, commit, document, executeStartOptimization],
  )

  const {
    execute: executeCancelOptimization,
    isPending: isCancelingOptimization,
  } = useLatitudeAction(cancelOptimizationAction, {
    onSuccess: async ({ data: { optimization } }) => {
      mutate((prev) => [optimization, ...(prev ?? [])])
      toast({
        title: 'Optimization canceled successfully',
        description: `Optimization canceled successfully`,
      })
    },
    onError: async (error) => {
      if (error.code !== 'ERROR') return
      toast({
        title: 'Error canceling optimization',
        description: error?.message,
        variant: 'destructive',
      })
    },
  })
  const cancelOptimization = useCallback(
    async ({ optimizationId }: { optimizationId: number }) => {
      return await executeCancelOptimization({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        optimizationId: optimizationId,
      })
    },
    [project, commit, document, executeCancelOptimization],
  )

  const onMessage = useCallback(
    (args: EventArgs<'optimizationStatus'>) => {
      if (!args) return
      if (args.optimization.projectId !== project.id) return
      if (args.optimization.documentUuid !== document.documentUuid) return

      mutate(
        (prev) => {
          prev = prev ?? []
          if (!prev.find((o) => o.id === args.optimization.id)) {
            return [args.optimization, ...prev]
          }
          return prev.map((o) =>
            o.id === args.optimization.id ? args.optimization : o,
          )
        },
        { revalidate: false },
      )
    },
    [project, document, mutate],
  )
  useSockets({ event: 'optimizationStatus', onMessage })

  return useMemo(
    () => ({
      data,
      mutate,
      isLoading,
      startOptimization,
      isStartingOptimization,
      cancelOptimization,
      isCancelingOptimization,
    }),
    [
      data,
      mutate,
      isLoading,
      startOptimization,
      isStartingOptimization,
      cancelOptimization,
      isCancelingOptimization,
    ],
  )
}

export function useOptimizationsCount(
  {
    project,
    commit,
    document,
  }: {
    project: Pick<Project, 'id'>
    commit: Pick<Commit, 'uuid'>
    document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<number>(
    ROUTES.api.projects
      .detail(project.id)
      .documents.detail(document.documentUuid).optimizations.count,
  )

  const {
    data = 0,
    isLoading,
    ...rest
  } = useSWR<number>(
    compact([
      'optimizationsCount',
      project.id,
      commit.uuid,
      document.commitId,
      document.documentUuid,
    ]),
    fetcher,
    opts,
  )

  return {
    data,
    isLoading,
    ...rest,
  }
}
