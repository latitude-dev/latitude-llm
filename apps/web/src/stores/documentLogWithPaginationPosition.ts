import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export type LogWithPosition = {
  position: number
  page: number
}

export default function useDocumentLogWithPaginationPosition(
  {
    documentLogUuid,
    onFetched,
  }: {
    documentLogUuid?: string | null
    onFetched?: (data: LogWithPosition) => void
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    documentLogUuid
      ? ROUTES.api.documentLogs.uuids.detail({ uuid: documentLogUuid })
          .withPosition
      : undefined,
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
