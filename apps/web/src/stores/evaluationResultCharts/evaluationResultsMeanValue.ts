import { useCallback } from 'react'

import { useCurrentProject, useToast } from '@latitude-data/web-ui'
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
  { fallbackData }: SWRConfiguration = {},
) {
  const { toast } = useToast()
  const { project } = useCurrentProject()
  const fetcher = useCallback(async () => {
    const [data, error] = await computeEvaluationResultsMeanValueAction({
      projectId: project.id,
      commitUuid,
      documentUuid,
      evaluationId,
    })

    if (error) {
      toast({
        title: 'Error fetching mean value',
        description: error.formErrors?.[0] || error.message,
        variant: 'destructive',
      })
      return null
    }

    return data
  }, [commitUuid, documentUuid, evaluationId, project.id, toast])
  const { data, isLoading, error, mutate } = useSWR(
    ['evaluationResultsMeanQuery', commitUuid, documentUuid, evaluationId],
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
