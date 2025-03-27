import { useMemo } from 'react'

import { type EvaluationResultByDocument } from '@latitude-data/core/repositories'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

type SerializedEvaluationResult = Omit<
  EvaluationResultByDocument,
  'createdAt' | 'updatedAt'
> & {
  createdAt: Date
}

const EMPTY_ROWS: SerializedEvaluationResult[] = []
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
  const route = useMemo(() => {
    const route = ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluationResultsByDocumentContent.detail({ evaluationId }).root

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })

    return route.toString() + '?' + params.toString()
  }, [projectId, commitUuid, documentUuid, evaluationId, page, pageSize])

  const fetcher = useFetcher<
    SerializedEvaluationResult[],
    EvaluationResultByDocument[]
  >(route, {
    serializer: (rows) => rows.map(deserialize),
    fallback: [],
  })

  const { data, isLoading, mutate } = useSWR<
    EvaluationResultByDocument[],
    SerializedEvaluationResult[]
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

  return { data: data ?? EMPTY_ROWS, isLoading, mutate }
}

function deserialize(item: EvaluationResultByDocument) {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
  }
}
