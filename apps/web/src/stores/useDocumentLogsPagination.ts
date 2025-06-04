import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { DocumentLogFilterOptions } from '@latitude-data/core/browser'
import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentLogsPagination(
  {
    projectId,
    commitUuid,
    documentUuid,
    filterOptions,
    page,
    pageSize,
    excludeErrors = false,
    disable,
  }: {
    documentUuid?: string
    projectId: number
    commitUuid: string
    filterOptions: DocumentLogFilterOptions
    page: string | null
    pageSize: string | null
    excludeErrors?: boolean
    disable?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<IPagination>(
    disable
      ? undefined
      : documentUuid
        ? ROUTES.api.projects
            .detail(projectId)
            .documents.detail(documentUuid)
            .logs.pagination({
              page: Number(page ?? 1),
              pageSize: Number(pageSize ?? 10),
              commitUuid,
              filterOptions,
              excludeErrors,
            })
        : undefined,
    {
      fallback: null,
    },
  )

  const { data, isLoading, error, mutate } = useSWR<IPagination>(
    [
      'documentLogsCount',
      documentUuid,
      projectId,
      commitUuid,
      filterOptions,
      page,
      pageSize,
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
