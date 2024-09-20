import { useCallback } from 'react'

import { useCurrentProject, useToast } from '@latitude-data/web-ui'
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
  { fallbackData }: SWRConfiguration = {},
) {
  const { project } = useCurrentProject()
  const { toast } = useToast()
  const fetcher = useCallback(async () => {
    const [data, error] = await computeEvaluationResultsModalValueAction({
      projectId: project.id,
      commitUuid,
      documentUuid,
      evaluationId,
    })

    if (error) {
      toast({
        title: 'Error fetching evaluation modal value',
        description: error.formErrors?.[0] || error.message,
        variant: 'destructive',
      })
      return null
    }

    return data
  }, [commitUuid, documentUuid, evaluationId, project.id])
  const { data, isLoading, error, mutate } = useSWR(
    ['evaluationResultsModalQuery', commitUuid, documentUuid, evaluationId],
    fetcher,
    { fallbackData },
  )

  return {
    data,
    isLoading,
    error,
    refetch: mutate,
  }
}
