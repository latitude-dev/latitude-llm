import {
  DocumentLog,
  DocumentLogFilterOptions,
} from '@latitude-data/core/browser'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

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
  }: {
    projectId: number
    documentUuid?: string
    filterOptions: DocumentLogFilterOptions
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
          .documents.detail(documentUuid)
          .logs.root({
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            excludeErrors,
            filterOptions,
          })
      : undefined,
    {
      serializer: (rows) => rows.map(documentLogPresenter),
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

export function documentLogPresenter(
  documentLog: DocumentLogWithMetadataAndError,
) {
  return {
    ...documentLog,
    createdAt: new Date(documentLog.createdAt),
  }
}
