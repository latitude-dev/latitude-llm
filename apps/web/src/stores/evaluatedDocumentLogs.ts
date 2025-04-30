import {
  DocumentLogFilterOptions,
  EvaluatedDocumentLog,
} from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { useMemo } from 'react'

const EMPTY_ARRAY: [] = []
export default function useEvaluatedDocumentLogs(
  {
    projectId,
    documentUuid,
    filterOptions,
    page,
    pageSize,
    onFetched,
  }: {
    projectId: number
    documentUuid?: string
    filterOptions: DocumentLogFilterOptions
    page: string | null | undefined
    pageSize: string | null
    onFetched?: (logs: EvaluatedDocumentLog[]) => void
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const fetcher = useFetcher<EvaluatedDocumentLog[], EvaluatedDocumentLog[]>(
    documentUuid
      ? ROUTES.api.projects
          .detail(projectId)
          .documents.detail(documentUuid)
          .evaluatedLogs.root({
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            filterOptions,
          })
      : undefined,
  )

  const {
    data = EMPTY_ARRAY,
    isLoading,
    mutate,
  } = useSWR<EvaluatedDocumentLog[]>(
    [
      'evaluatedDocumentLogs',
      projectId,
      documentUuid,
      filterOptions,
      page,
      pageSize,
    ],
    fetcher,
    {
      fallbackData,
      onSuccess: (logs) => {
        onFetched?.(logs)
      },
    },
  )

  return useMemo(() => ({ data, mutate, isLoading }), [mutate, data, isLoading])
}
