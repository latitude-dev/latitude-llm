import { useMemo } from 'react'

import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
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
    serializer: ({ rows, count }) => ({ rows: rows.map(deserialize), count }),
    fallback: { rows: [], count: 0 },
  })

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

function deserialize(item: SerializedEvaluationResult) {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
