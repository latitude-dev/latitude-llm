import useSWR, { SWRConfiguration } from 'swr'
import { useMemo } from 'react'
import { DocumentIntegrationReference } from '@latitude-data/core/schema/types'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'

const EMPTY_ARRAY: DocumentIntegrationReference[] = []
export default function useDocumentIntegrationReferences(
  {
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId: number
    commitUuid: string
    documentUuid?: string
  },
  opts: SWRConfiguration = {},
) {
  const apiRoute = ROUTES.api.projects
    .detail(projectId)
    .commits.detail(commitUuid).integrationReferences.root
  const searchParams: Record<string, string> = documentUuid
    ? { documentUuid }
    : {}
  const fetcher = useFetcher<DocumentIntegrationReference[]>(apiRoute, {
    searchParams,
  })

  const { data = EMPTY_ARRAY, isLoading } = useSWR<
    DocumentIntegrationReference[]
  >(
    ['documentIntegrationReferences', projectId, commitUuid, documentUuid],
    fetcher,
    opts,
  )

  return useMemo(
    () => ({
      data,
      isLoading,
    }),
    [data, isLoading],
  )
}
