import { useMemo } from 'react'

import {
  EvaluationResultDto,
  EvaluationResultWithMetadata,
} from '@latitude-data/core/repositories'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

type SerializedEvaluationResult = Omit<
  EvaluationResultWithMetadata,
  'createdAt' | 'updatedAt'
> & {
  createdAt: string
  updatedAt: string
}

export type EvaluationResultByDocument = Pick<
  EvaluationResultDto,
  'id' | 'result' | 'createdAt' | 'source'
>

const EMPTY_ROWS: EvaluationResultByDocument[] = []
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

  const fetcher = useFetcher(route, {
    serializer: (rows) => rows.map(deserialize),
    fallback: [],
  })

  const { data, isLoading, mutate } = useSWR<EvaluationResultByDocument[]>(
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

function deserialize(item: SerializedEvaluationResult) {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
  }
}
