'use client'

import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { AnnotationQueueStatusCounts } from '@latitude-data/core/queries/clickhouse/annotationQueueItems/findItems'

type StatusCountsByQueue = Record<number, AnnotationQueueStatusCounts>

export function useAnnotationQueueStatusCounts(
  { projectId }: { projectId: number },
  opts?: SWRConfiguration,
) {
  const route =
    API_ROUTES.projects.detail(projectId).annotationQueues.statusCounts
  const fetcher = useFetcher<StatusCountsByQueue>(route)
  const { data, ...rest } = useSWR<StatusCountsByQueue>(
    ['annotationQueuesStatusCounts', projectId],
    fetcher,
    opts,
  )

  return useMemo(() => ({ data: data ?? {}, ...rest }), [data, rest])
}
