import { useCallback } from 'react'

import { useCurrentProject, useToast } from '@latitude-data/web-ui'
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
  { fallbackData }: SWRConfiguration = {},
) {
  const { project } = useCurrentProject()
  const { toast } = useToast()
  const fetcher = useCallback(async () => {
    const [data, error] = await computeEvaluationResultsCountersAction({
      projectId: project.id,
      commitUuid,
      documentUuid,
      evaluationId,
    })

    if (error) {
      toast({
        title: 'Error fetching evaluation stats',
        description: error.formErrors?.[0] || error.message,
        variant: 'destructive',
      })
      return null
    }
    return data
  }, [commitUuid, documentUuid, evaluationId, project.id, toast])
  const { data, isLoading, error, mutate } = useSWR(
    ['evaluationResultsCounters', commitUuid, documentUuid, evaluationId],
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
