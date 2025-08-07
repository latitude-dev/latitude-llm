import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import type { ProjectStats } from '@latitude-data/core/browser'
import useSWR, { type SWRConfiguration } from 'swr'

export default function useProjectStats(
  {
    projectId,
    disable,
  }: {
    projectId: number
    disable?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<ProjectStats>(
    disable ? undefined : ROUTES.api.projects.detail(projectId).stats.root,
  )

  const { data, isLoading, error, mutate } = useSWR(['projectStats', projectId], fetcher, opts)

  return {
    data: data ?? {
      totalTokens: 0,
      totalRuns: 0,
      totalDocuments: 0,
      runsPerModel: {},
      costPerModel: {},
      rollingDocumentLogs: [],
      totalEvaluations: 0,
      totalEvaluationResults: 0,
      costPerEvaluation: {},
    },
    isLoading,
    error,
    refetch: mutate,
  }
}
