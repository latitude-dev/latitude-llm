import { DocumentVersion } from '@latitude-data/core/browser'
import { compactObject } from '@latitude-data/core/lib/compactObject'
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
    commitUuid,
    document,
    documentLogUuid,
    onFetched,
    excludeErrors = false,
  }: {
    projectId: number
    commitUuid: string
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
          .commits.detail(commitUuid)
          .documents.detail(document.documentUuid)
          .documentLogs.detail(documentLogUuid).position
      : undefined,
    {
      searchParams: compactObject({
        excludeErrors: excludeErrors ? 'true' : undefined,
      }) as Record<string, string>,
    },
  )
  const { data, isLoading } = useSWR<LogWithPosition>(
    ['documentLogWithPosition', documentLogUuid],
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
