'use client'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { DocumentVersionDto } from '@latitude-data/core/constants'

export default function useDocumentVersion(
  {
    projectId,
    documentUuid,
    commitUuid,
  }: {
    projectId: number
    commitUuid: string
    documentUuid: string | null
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<DocumentVersionDto>(
    documentUuid ? ROUTES.api.documents.detail(documentUuid).root : undefined,
    {
      searchParams: {
        projectId: projectId.toString(),
        commitUuid,
      },
      fallback: null,
    },
  )

  return useSWR<DocumentVersionDto>(
    ['commits', projectId, commitUuid, 'documents', documentUuid],
    fetcher,
    opts,
  )
}
