import { DocumentLogFilterOptions } from '@latitude-data/core/browser'
import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
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
  }: {
    documentUuid?: string
    projectId: number
    commitUuid: string
    filterOptions: DocumentLogFilterOptions
    page: number
    pageSize: number
    excludeErrors?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<IPagination>(
    documentUuid
      ? ROUTES.api.projects
          .detail(projectId)
          .documents.detail(documentUuid)
          .logs.pagination({
            page,
            pageSize,
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
