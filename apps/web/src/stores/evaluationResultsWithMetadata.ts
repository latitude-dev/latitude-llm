import { useMemo } from 'react'

import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
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
  opts: SWRConfiguration,
) {
  const { toast } = useToast()
  const { data = EMPTY_ARRAY, ...rest } = useSWR<
    EvaluationResultWithMetadata[]
  >(
    ['evaluationResults', evaluationId, documentUuid, commitUuid, projectId],
    async () => {
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
    },
    opts,
  )

  return useMemo(() => ({ data, ...rest }), [data, rest])
}
