import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { DocumentLogWithMetadata } from '@latitude-data/core/constants'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentLogWithMetadata(
  {
    documentLogUuid,
  }: {
    documentLogUuid?: string | null
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<DocumentLogWithMetadata>(
    documentLogUuid
      ? ROUTES.api.documentLogs.uuids.detail({ uuid: documentLogUuid }).root
      : undefined,
    { fallback: null },
  )
  return useSWR<DocumentLogWithMetadata>(
    ['documentLogWithMetadata', documentLogUuid],
    fetcher,
    opts,
  )
}
