import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import {
  ActualOutputConfiguration,
  DocumentLogFilterOptions,
  EvaluatedDocumentLog,
} from '@latitude-data/core/constants'
import { useMemo, useState } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: [] = []
export default function useEvaluatedDocumentLogs(
  {
    projectId,
    documentUuid,
    filterOptions,
    page,
    pageSize,
    configuration,
    onFetched,
  }: {
    projectId: number
    documentUuid?: string
    filterOptions: DocumentLogFilterOptions
    page: string | null | undefined
    pageSize: string | null
    configuration: ActualOutputConfiguration
    onFetched?: (logs: EvaluatedDocumentLog[]) => void
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const [error, setError] = useState<string>()

  const fetcher = useFetcher<EvaluatedDocumentLog[]>(
    documentUuid
      ? ROUTES.api.projects
          .detail(projectId)
          .documents.detail(documentUuid)
          .evaluatedLogs.root({
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            filterOptions,
            configuration: JSON.stringify(configuration),
          })
      : undefined,
    {
      onSuccess: () => setError(undefined),
      onFail: (message) => setError(message),
    },
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
      configuration,
    ],
    fetcher,
    {
      fallbackData,
      onSuccess: (logs) => {
        onFetched?.(logs)
      },
    },
  )

  return useMemo(
    () => ({ data, mutate, isLoading, error }),
    [mutate, data, isLoading, error],
  )
}
