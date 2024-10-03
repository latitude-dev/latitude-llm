import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentLogWithMetadata(
  documentLogUuid?: string | null,
  opts?: SWRConfiguration,
) {
  return useSWR<DocumentLogWithMetadata>(
    ['documentLogWithMetadata', documentLogUuid],
    async () => {
      if (!documentLogUuid) return []

      const response = await fetch(
        ROUTES.api.documentLogs.uuids.detail({ uuid: documentLogUuid }).root,
        {
          credentials: 'include',
        },
      )
      if (!response.ok) {
        const error = await response.json()

        console.error(error)

        return []
      }

      return response.json()
    },
    opts,
  )
}
