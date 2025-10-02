import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { DocumentLogWithMetadata } from '@latitude-data/core/schema/types'

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
