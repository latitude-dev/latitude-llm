import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentLogWithMetadata(
  {
    documentLogUuid,
  }: {
    documentLogUuid?: string | null
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    documentLogUuid
      ? ROUTES.api.documentLogs.uuids.detail({ uuid: documentLogUuid }).root
      : undefined,
  )
  return useSWR<DocumentLogWithMetadata>(
    ['documentLogWithMetadata', documentLogUuid],
    fetcher,
    opts,
  )
}
