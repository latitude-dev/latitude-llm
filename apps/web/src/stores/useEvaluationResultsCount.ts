import { compactObject } from '@latitude-data/core/lib/compactObject'
import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationResultsPagination(
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
    page: string | null
    pageSize: string | null
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<IPagination>(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluations.detail({ evaluationId }).evaluationResults.pagination,
    {
      searchParams: compactObject({
        page: page ? String(page) : undefined,
        pageSize: pageSize ? String(pageSize) : undefined,
      }) as Record<string, string>,
      fallback: null,
    },
  )

  const { data, isLoading, error, mutate } = useSWR<IPagination>(
    [
      'evaluationResultsCount',
      evaluationId,
      documentUuid,
      commitUuid,
      projectId,
    ],
    fetcher,
    opts,
  )

  return {
    data,
    isLoading,
    error,
    refetch: mutate,
  }
}
