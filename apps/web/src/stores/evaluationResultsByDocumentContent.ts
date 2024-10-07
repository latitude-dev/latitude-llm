import { useCallback } from 'react'

import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import { useToast } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

type SerializedEvaluationResult = Omit<
  EvaluationResultWithMetadata,
  'createdAt' | 'updatedAt'
> & {
  createdAt: string
  updatedAt: string
}

const EMPTY_ARRAY: [] = []
export default function useEvaluationResultsByDocumentContent(
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
    const response = await fetch(
      ROUTES.api.documents
        .detail({ projectId })
        .detail({
          commitUuid,
        })
        .detail({ documentUuid })
        .evaluationResultsByDocumentContent.detail({ evaluationId }).root,
      {
        credentials: 'include',
      },
    )
    if (!response.ok) {
      const error = await response.json()

      console.error(error)

      return []
    }

    const jsonResult = await response.json()

    return jsonResult.map((result: SerializedEvaluationResult) => {
      return {
        ...result,
        createdAt: new Date(result.createdAt),
        updatedAt: new Date(result.updatedAt),
      } as EvaluationResultWithMetadata
    })
  }, [commitUuid, documentUuid, evaluationId, projectId, toast])

  const {
    data = EMPTY_ARRAY,
    isLoading,
    mutate,
  } = useSWR(
    [
      'evaluationResultsByDocumentContent',
      evaluationId,
      documentUuid,
      commitUuid,
      projectId,
    ],
    fetcher,
    { fallbackData },
  )

  return { data, isLoading, mutate }
}
