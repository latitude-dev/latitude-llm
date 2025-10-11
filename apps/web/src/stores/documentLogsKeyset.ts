import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import {
  DocumentLog,
  DocumentLogFilterOptions,
  DocumentLogWithMetadataAndError,
} from '@latitude-data/core/constants'
import useSWR, { SWRConfiguration } from 'swr'

export interface KeysetPaginationResult<T> {
  data: T[]
  hasNext: boolean
  hasPrevious: boolean
  nextCursor?: string
  previousCursor?: string
}

type MaybeBoolean = boolean | undefined
type LogResult<T extends MaybeBoolean> = T extends true
  ? DocumentLog
  : DocumentLogWithMetadataAndError

export default function useDocumentLogsKeyset<T extends MaybeBoolean = boolean>(
  {
    projectId,
    documentUuid,
    filterOptions,
    after,
    before,
    limit,
    onFetched,
    excludeErrors = false,
    disable,
  }: {
    projectId: number
    documentUuid?: string
    filterOptions: DocumentLogFilterOptions
    after?: string | null
    before?: string | null
    limit?: number
    onFetched?: (result: KeysetPaginationResult<LogResult<T>>) => void
    excludeErrors?: T
    disable?: boolean
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const fetcher = useFetcher<
    KeysetPaginationResult<LogResult<T>>,
    KeysetPaginationResult<LogResult<T>>
  >(
    disable
      ? undefined
      : documentUuid
        ? ROUTES.api.projects
            .detail(projectId)
            .documents.detail(documentUuid)
            .logs.keyset({
              after: after || undefined,
              before: before || undefined,
              limit,
              excludeErrors,
              filterOptions,
            })
        : undefined,
    {
      serializer: (result) => ({
        ...result,
        data: result.data.map(documentLogPresenter<T>),
      }),
    },
  )

  const {
    data = { data: [], hasNext: false, hasPrevious: false },
    isLoading,
    mutate,
  } = useSWR<KeysetPaginationResult<LogResult<T>>>(
    [
      'documentLogsKeyset',
      projectId,
      documentUuid,
      filterOptions,
      after,
      before,
      limit,
    ],
    fetcher,
    {
      fallbackData,
      onSuccess: (result) => {
        onFetched?.(result)
      },
    },
  )

  return {
    data: data.data,
    hasNext: data.hasNext,
    hasPrevious: data.hasPrevious,
    nextCursor: data.nextCursor,
    previousCursor: data.previousCursor,
    mutate,
    isLoading,
  }
}

export function documentLogPresenter<T extends MaybeBoolean = boolean>(
  documentLog: LogResult<T>,
) {
  return {
    ...documentLog,
    createdAt: new Date(documentLog.createdAt),
  }
}
