import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: [] = []
export default function useEvaluationResultsWithMetadata(
  {
    evaluationId,
    documentUuid,
    commitUuid,
    projectId,
    page,
    pageSize,
  }: {
    evaluationId: number
    documentUuid: string
    commitUuid: string
    projectId: number
    page?: string | number | null
    pageSize?: string | number | null
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const fetcher = useFetcher<
    EvaluationResultWithMetadataAndErrors[],
    EvaluationResultWithMetadataAndErrors[]
  >(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluations.detail({ evaluationId }).evaluationResults.root,
    {
      serializer: (rows) => rows.map(deserialize),
      searchParams: compactObject({
        page: page ? String(page) : undefined,
        pageSize: pageSize ? String(pageSize) : undefined,
      }) as Record<string, string>,
    },
  )
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<EvaluationResultWithMetadataAndErrors[]>(
    [
      'evaluationResults',
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

  return { data, mutate, ...rest }
}

function deserialize(item: EvaluationResultWithMetadataAndErrors) {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
