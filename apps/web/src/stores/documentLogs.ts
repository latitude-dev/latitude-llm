import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import type {
  DocumentLog,
  DocumentLogFilterOptions,
  DocumentLogWithMetadataAndError,
} from '@latitude-data/core/browser'
import useSWR, { type SWRConfiguration } from 'swr'

type MaybeBoolean = boolean | undefined
const EMPTY_ARRAY: [] = []
type LogResult<T extends MaybeBoolean> = T extends true
  ? DocumentLog
  : DocumentLogWithMetadataAndError
export default function useDocumentLogs<T extends MaybeBoolean = boolean>(
  {
    projectId,
    documentUuid,
    filterOptions,
    page,
    pageSize,
    onFetched,
    excludeErrors = false,
    disable,
  }: {
    projectId: number
    documentUuid?: string
    filterOptions: DocumentLogFilterOptions
    page: string | null | undefined
    pageSize: string | null
    onFetched?: (logs: LogResult<T>[]) => void
    excludeErrors?: T
    disable?: boolean
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const fetcher = useFetcher<LogResult<T>[], LogResult<T>[]>(
    disable
      ? undefined
      : documentUuid
        ? ROUTES.api.projects
            .detail(projectId)
            .documents.detail(documentUuid)
            .logs.root({
              page: page ? Number(page) : undefined,
              pageSize: pageSize ? Number(pageSize) : undefined,
              excludeErrors,
              filterOptions,
            })
        : undefined,
    {
      serializer: (rows) => rows.map(documentLogPresenter<T>),
    },
  )

  const {
    data = EMPTY_ARRAY,
    isLoading,
    mutate,
  } = useSWR<LogResult<T>[]>(
    ['documentLogs', projectId, documentUuid, filterOptions, page, pageSize],
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

export function documentLogPresenter<T extends MaybeBoolean = boolean>(documentLog: LogResult<T>) {
  return {
    ...documentLog,
    createdAt: new Date(documentLog.createdAt),
  }
}
