import { useCurrentProject } from '@latitude-data/web-ui'
import { computeEvaluationResultsModalValueAction } from '$/actions/evaluationResults/computeEvaluationResultsModalValueAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationResultsModalValue(
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
    ['evaluationResultsModalQuery', commitUuid, documentUuid, evaluationId],
    async () => {
      const [data, error] = await computeEvaluationResultsModalValueAction({
        projectId: project.id,
        commitUuid,
        documentUuid,
        evaluationId,
      })

      if (error) null

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
