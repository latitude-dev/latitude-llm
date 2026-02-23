'use client'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { DocumentVersionDto } from '@latitude-data/core/constants'
import { updateDocumentContentAction } from '$/actions/documents/updateContent'
import { useCallback, useMemo } from 'react'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useDocumentVersions from './documentVersions'

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
  const { mutate: mutateDocumentVersions } = useDocumentVersions({
    projectId,
    commitUuid,
  })
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

  const { data, mutate } = useSWR<DocumentVersionDto>(
    ['commits', projectId, commitUuid, 'documents', documentUuid],
    fetcher,
    opts,
  )

  const { execute: updateContent, isPending: isUpdatingContent } =
    useLatitudeAction(updateDocumentContentAction, {
      onSuccess: useCallback(
        ({ data: document }: { data: DocumentVersionDto }) => {
          if (!document) return

          mutate(document)
          mutateDocumentVersions(
            (documents) =>
              documents?.map((d) => (d.id === document.id ? document : d)),
            { revalidate: false },
          )
        },
        [mutate, mutateDocumentVersions],
      ),
    })

  return useMemo(
    () => ({
      data,
      isUpdatingContent,
      updateContent,
      mutate,
    }),
    [data, isUpdatingContent, updateContent, mutate],
  )
}
