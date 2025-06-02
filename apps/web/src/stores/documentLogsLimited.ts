import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import {
  DocumentLogFilterOptions,
  DocumentLogWithMetadataAndError,
} from '@latitude-data/core/browser'
import useSWR, { SWRConfiguration } from 'swr'

type UseDocumentLogsLimitedResult = {
  items: DocumentLogWithMetadataAndError[]
  next: string | null
}

export default function useDocumentLogsLimited(
  {
    projectId,
    documentUuid,
    from,
    filters,
    disable,
  }: {
    projectId: number
    documentUuid?: string
    from: string | null
    filters: DocumentLogFilterOptions
    disable?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<
    UseDocumentLogsLimitedResult,
    UseDocumentLogsLimitedResult
  >(
    disable
      ? undefined
      : documentUuid
        ? ROUTES.api.projects
            .detail(projectId)
            .documents.detail(documentUuid)
            .logs.limited({ from, filters })
        : undefined,
    {
      serializer: ({ items, next }) => ({
        items: items.map(documentLogPresenter),
        next,
      }),
    },
  )

  const {
    data = { items: [], next: null },
    isLoading,
    mutate,
  } = useSWR<UseDocumentLogsLimitedResult>(
    ['documentLogsLimited', projectId, documentUuid, from, filters],
    fetcher,
    opts,
  )

  return { data, mutate, isLoading }
}

export function documentLogPresenter(
  documentLog: DocumentLogWithMetadataAndError,
) {
  return { ...documentLog, createdAt: new Date(documentLog.createdAt) }
}
