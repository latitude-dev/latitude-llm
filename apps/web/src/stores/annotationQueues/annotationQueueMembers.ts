'use client'

import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { API_ROUTES } from '$/services/routes/api'
import { AnnotationQueueMember } from '@latitude-data/core/schema/models/types/AnnotationQueue'

export function useAnnotationQueueMembers(
  { projectId }: { projectId: number },
  opts?: SWRConfiguration,
) {
  const route = API_ROUTES.projects.detail(projectId).annotationQueues.members
  const fetcher = useFetcher<AnnotationQueueMember[]>(route)
  const { data = [], ...rest } = useSWR<AnnotationQueueMember[]>(
    ['annotationQueuesMembers', projectId],
    fetcher,
    opts,
  )

  const membersByQueue = useMemo(() => {
    const map: Record<number, AnnotationQueueMember[]> = {}
    for (const member of data) {
      if (!map[member.annotationQueueId]) {
        map[member.annotationQueueId] = []
      }
      map[member.annotationQueueId]!.push(member)
    }
    return map
  }, [data])

  return useMemo(
    () => ({ data, membersByQueue, ...rest }),
    [data, membersByQueue, rest],
  )
}
