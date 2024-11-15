import { DocumentLog } from '@latitude-data/core/browser'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: [] = []
type LogResult<T extends boolean> = T extends true
  ? DocumentLog
  : DocumentLogWithMetadataAndError
export default function useDocumentLogs<T extends boolean>(
  {
    documentUuid,
    commitUuid,
    projectId,
    page,
    pageSize,
    onFetched,
    excludeErrors = false,
  }: {
    documentUuid?: string
    commitUuid: string
    projectId: number
    page: string | null | undefined
    pageSize: string | null
    onFetched?: (logs: LogResult<T>[]) => void
    excludeErrors?: T
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const fetcher = useFetcher(
    documentUuid
      ? ROUTES.api.projects
          .detail(projectId)
          .commits.detail(commitUuid)
          .documents.detail(documentUuid).documentLogs.root
      : undefined,
    {
      serializer: (rows) => rows.map(documentLogPresenter),
      searchParams: compactObject({
        page: page ? String(page) : undefined,
        pageSize: pageSize ? String(pageSize) : undefined,
        excludeErrors: excludeErrors ? 'true' : undefined,
      }) as Record<string, string>,
    },
  )

  const {
    data = EMPTY_ARRAY,
    isLoading,
    mutate,
  } = useSWR<LogResult<T>[]>(
    ['documentLogs', documentUuid, commitUuid, projectId, page, pageSize],
    fetcher,
    {
      fallbackData,
      onSuccess: (logs) => {
        onFetched?.(logs)
      },
    },
  )

  return { data, mutate, isLoading }
}

export function documentLogPresenter(
  documentLog: DocumentLogWithMetadataAndError,
) {
  return {
    ...documentLog,
    createdAt: new Date(documentLog.createdAt),
  }
}
