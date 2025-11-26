import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { AnnotationsProgressResponse } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/annotationsProgress/route'

const EMPTY_RESPONSE: AnnotationsProgressResponse = {
  totalRuns: 0,
  currentAnnotations: 0,
}
export function useAnnotationsProgress(
  {
    projectId,
    commitUuid,
  }: {
    projectId: number
    commitUuid: string
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects.detail(projectId).commits.detail(commitUuid)
    .issues.annotationsProgress
  const fetcher = useFetcher<AnnotationsProgressResponse>(route)

  const {
    data = EMPTY_RESPONSE,
    mutate: refetch,
    isLoading,
  } = useSWR<AnnotationsProgressResponse>(
    ['annotationsProgress', projectId, commitUuid],
    fetcher,
    opts,
  )

  return useMemo(() => {
    return {
      data,
      refetch,
      isLoading,
    }
  }, [data, refetch, isLoading])
}
