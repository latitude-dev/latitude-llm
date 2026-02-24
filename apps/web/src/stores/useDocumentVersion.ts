'use client'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { DocumentVersionDto } from '@latitude-data/core/constants'
import { useMemo } from 'react'

export function getDocumentVersionCacheKey({
  projectId,
  commitUuid,
  documentUuid,
}: {
  projectId: number
  commitUuid: string
  documentUuid: string
}) {
  return ['commits', projectId, commitUuid, 'documents', documentUuid] as const
}

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
  const enabled = !!documentUuid
  const fetcher = useFetcher<DocumentVersionDto>(
    enabled ? ROUTES.api.documents.detail(documentUuid).root : undefined,
    {
      searchParams: {
        projectId: projectId.toString(),
        commitUuid,
      },
      fallback: null,
    },
  )

  const { data, mutate } = useSWR<DocumentVersionDto>(
    enabled
      ? getDocumentVersionCacheKey({ projectId, commitUuid, documentUuid })
      : undefined,
    fetcher,
    opts,
  )

  return useMemo(
    () => ({
      data,
      mutate,
    }),
    [data, mutate],
  )
}
