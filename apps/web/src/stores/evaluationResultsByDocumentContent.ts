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

export default function useEvaluationResultsByDocumentContent(
  {
    evaluationId,
    documentUuid,
    commitUuid,
    projectId,
    page = 1,
    pageSize = 10,
  }: {
    evaluationId: number
    documentUuid: string
    commitUuid: string
    projectId: number
    page: number
    pageSize: number
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const { toast } = useToast()

  const fetcher = useCallback(async () => {
    const route = ROUTES.api.documents
      .detail({ projectId })
      .detail({
        commitUuid,
      })
      .detail({ documentUuid })
      .evaluationResultsByDocumentContent.detail({ evaluationId }).root

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })

    const url = route.toString() + '?' + params.toString()

    const response = await fetch(url, {
      credentials: 'include',
    })
    if (!response.ok) {
      const error = await response.json()
      toast({
        title: 'Error',
        description: error?.err?.message || error?.message,
        variant: 'destructive',
      })

      return { rows: [], count: 0 }
    }

    const { rows, count } = await response.json()

    const reformattedRows = rows.map((result: SerializedEvaluationResult) => {
      return {
        ...result,
        createdAt: new Date(result.createdAt),
        updatedAt: new Date(result.updatedAt),
      }
    }) as EvaluationResultWithMetadata[]

    return { rows: reformattedRows, count } as {
      rows: EvaluationResultWithMetadata[]
      count: number
    }
  }, [commitUuid, documentUuid, evaluationId, projectId, page, pageSize, toast])

  const { data, isLoading, mutate } = useSWR<
    { rows: EvaluationResultWithMetadata[]; count: number } | undefined
  >(
    [
      'evaluationResultsByDocumentContent',
      evaluationId,
      documentUuid,
      commitUuid,
      projectId,
      page,
      pageSize,
    ],
    fetcher,
    { fallbackData },
  )

  return { data, isLoading, mutate }
}
