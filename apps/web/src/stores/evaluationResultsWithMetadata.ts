import { useCallback } from 'react'

import { useToast } from '@latitude-data/web-ui'
import { computeEvaluationResultsWithMetadataAction } from '$/actions/evaluations/computeEvaluationResultsWithMetadata'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: [] = []
export default function useEvaluationResultsWithMetadata(
  {
    evaluationId,
    documentUuid,
    commitUuid,
    projectId,
  }: {
    evaluationId: number
    documentUuid: string
    commitUuid: string
    projectId: number
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const { toast } = useToast()
  const fetcher = useCallback(async () => {
    const [data, error] = await computeEvaluationResultsWithMetadataAction({
      evaluationId,
      documentUuid,
      commitUuid,
      projectId,
    })

    if (error) {
      toast({
        title: 'Error fetching evaluations',
        description: error.formErrors?.[0] || error.message,
        variant: 'destructive',
      })
      throw error
    }

    return data
  }, [commitUuid, documentUuid, evaluationId, projectId, toast])
  const { data = EMPTY_ARRAY, mutate } = useSWR(
    ['evaluationResults', evaluationId, documentUuid, commitUuid, projectId],
    fetcher,
    { fallbackData },
  )

  return { data, mutate }
}
