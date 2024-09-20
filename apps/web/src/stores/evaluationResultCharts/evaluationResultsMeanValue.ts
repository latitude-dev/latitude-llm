import { useCurrentProject } from '@latitude-data/web-ui'
import { computeEvaluationResultsMeanValueAction } from '$/actions/evaluationResults/computeEvaluationResultsMeanValueAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationResultsMeanValue(
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
    ['evaluationResultsMeanQuery', commitUuid, documentUuid, evaluationId],
    async () => {
      const [data, error] = await computeEvaluationResultsMeanValueAction({
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
