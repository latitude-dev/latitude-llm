import { compactObject } from '@latitude-data/core/lib/compactObject'
import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentLogsPagination(
  {
    documentUuid,
    commitUuid,
    projectId,
    page,
    pageSize,
    excludeErrors = false,
  }: {
    documentUuid: string
    commitUuid: string
    projectId: number
    page: string | null
    pageSize: string | null
    excludeErrors?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid).documentLogs.pagination,
    {
      searchParams: compactObject({
        page: page ? String(page) : undefined,
        pageSize: pageSize ? String(pageSize) : undefined,
        excludeErrors: excludeErrors ? 'true' : undefined,
      }) as Record<string, string>,
      fallback: null,
    },
  )

  const { data, isLoading, error, mutate } = useSWR<IPagination>(
    ['documentLogsCount', documentUuid, commitUuid, projectId],
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
