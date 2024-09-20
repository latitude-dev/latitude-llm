import { useCurrentProject } from '@latitude-data/web-ui'
import { computeEvaluationResultsCountersAction } from '$/actions/evaluationResults/computeEvaluationResultsCountersAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationResultsCounters(
  {
    commitUuid,
    documentUuid,
    evaluationId,
  }: {
    commitUuid: string
    documentUuid: string
    evaluationId: number
  },
  opts: SWRConfiguration = {},
) {
  const { project } = useCurrentProject()
  const { data, isLoading, error, mutate } = useSWR(
    ['evaluationResultsCounters', commitUuid, documentUuid, evaluationId],
    async () => {
      const [data, error] = await computeEvaluationResultsCountersAction({
        projectId: project.id,
        commitUuid,
        documentUuid,
        evaluationId,
      })

      if (error) return null
      return data
    },
    opts,
  )

  return {
    data,
    isLoading,
    error,
    refetch: mutate,
  }
}
