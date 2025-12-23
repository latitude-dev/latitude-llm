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
  HEAD_COMMIT,
  OptimizationConfiguration,
} from '@latitude-data/core/constants'
import { Pagination } from '@latitude-data/core/helpers'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { OptimizationWithDetails } from '@latitude-data/core/schema/types'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { compact } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration, useSWRConfig } from 'swr'

export function useOptimizations(
  {
    project,
    document,
    search = {
      page: 1,
      pageSize: DEFAULT_PAGINATION_SIZE,
    },
  }: {
    project: Pick<Project, 'id'>
    document: Pick<DocumentVersion, 'documentUuid'>
    search?: Pagination
  },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const { mutate: globalMutate } = useSWRConfig()

  const fetcher = useFetcher<OptimizationWithDetails[]>(
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
  } = useSWR<OptimizationWithDetails[]>(
    compact([
      'optimizations',
      project.id,
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
      mutate(
        (prev) =>
          prev?.map((o) => {
            if (o.id !== optimization.id) return o
            return optimization
          }) ?? [],
      )
      globalMutate(
        (key) =>
          Array.isArray(key) &&
          key[0] === 'optimizationsCount' &&
          key[1] === project.id &&
          key[2] === document.documentUuid,
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
      commitUuid,
      evaluationUuid,
      datasetId,
      configuration,
    }: {
      commitUuid: string
      evaluationUuid: string
      datasetId?: number
      configuration: OptimizationConfiguration
    }) => {
      return await executeStartOptimization({
        projectId: project.id,
        commitUuid: commitUuid,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluationUuid,
        datasetId: datasetId,
        configuration: configuration,
      })
    },
    [project, document, executeStartOptimization],
  )

  const {
    execute: executeCancelOptimization,
    isPending: isCancelingOptimization,
  } = useLatitudeAction(cancelOptimizationAction, {
    onSuccess: async ({ data: { optimization } }) => {
      mutate(
        (prev) =>
          prev?.map((o) => {
            if (o.id !== optimization.id) return o
            return optimization
          }) ?? [],
      )
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
    async ({
      optimizationId,
      commitUuid,
    }: {
      optimizationId: number
      commitUuid: string
    }) => {
      return await executeCancelOptimization({
        projectId: project.id,
        commitUuid: commitUuid,
        documentUuid: document.documentUuid,
        optimizationId: optimizationId,
      })
    },
    [project, document, executeCancelOptimization],
  )

  const onMessage = useCallback(
    (args: EventArgs<'optimizationStatus'>) => {
      if (!args) return
      if (args.optimization.projectId !== project.id) return
      if (args.optimization.documentUuid !== document.documentUuid) return
      ;(args.optimization as any).realtime = true

      mutate(
        (prev) => {
          if (!prev) return prev

          if (!prev.find((o) => o.id === args.optimization.id)) {
            return [args.optimization, ...prev]
          }
          return prev.map((o) =>
            o.id === args.optimization.id ? args.optimization : o,
          )
        },
        { revalidate: false },
      )

      const link = ROUTES.projects
        .detail({ id: args.optimization.projectId })
        .commits.detail({
          uuid:
            args.optimization.optimizedCommit?.uuid ??
            args.optimization.baselineCommit?.uuid ??
            HEAD_COMMIT,
        })
        .documents.detail({ uuid: args.optimization.documentUuid })
        .optimizations.detail({ uuid: args.optimization.uuid }).root

      if (args.optimization.finishedAt && !args.optimization.error) {
        toast({
          title: `Prompt ${args.optimization.document!.path.split('/').pop()} has been optimized`,
          description: 'Check out the results',
          href: link,
        })
      }
    },
    [project, document, mutate, toast],
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
    document,
  }: {
    project: Pick<Project, 'id'>
    document: Pick<DocumentVersion, 'documentUuid'>
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
    compact(['optimizationsCount', project.id, document.documentUuid]),
    fetcher,
    opts,
  )

  return {
    data,
    isLoading,
    ...rest,
  }
}
