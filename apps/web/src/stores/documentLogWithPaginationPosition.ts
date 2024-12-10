import {
  DocumentLogFilterOptions,
  DocumentVersion,
} from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export type LogWithPosition = {
  position: number
  page: number
}

export default function useDocumentLogWithPaginationPosition(
  {
    projectId,
    filterOptions,
    document,
    documentLogUuid,
    onFetched,
    excludeErrors = false,
  }: {
    projectId: number
    filterOptions: DocumentLogFilterOptions
    document: DocumentVersion
    documentLogUuid?: string | null
    onFetched?: (data: LogWithPosition) => void
    excludeErrors?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    documentLogUuid
      ? ROUTES.api.projects
          .detail(projectId)
          .documents.detail(document.documentUuid)
          .logs.detail(documentLogUuid)
          .position({ filterOptions, excludeErrors })
      : undefined,
  )
  const { data, isLoading } = useSWR<LogWithPosition>(
    [
      'documentLogWithPosition',
      documentLogUuid,
      projectId,
      filterOptions,
      excludeErrors,
    ],
    fetcher,
    {
      ...opts,
      onSuccess: (data) => {
        if (!documentLogUuid) return

        onFetched?.(data)
      },
    },
  )

  return {
    data,
    isLoading,
  }
}
