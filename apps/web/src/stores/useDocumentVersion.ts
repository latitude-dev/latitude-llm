'use client'

import { DocumentVersionDto } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentVersion(
  documentUuid?: string | null,
  { commitUuid }: { commitUuid?: string } = {},
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    documentUuid
      ? `${ROUTES.api.documents.detail(documentUuid).root}${
          commitUuid ? `?commitUuid=${commitUuid}` : ''
        }`
      : undefined,
    {
      fallback: null,
    },
  )

  return useSWR<DocumentVersionDto>(
    ['commits', commitUuid, 'documents', documentUuid],
    fetcher,
    opts,
  )
}
