import { useCallback } from 'react'

import type { PublishedDocument } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createPublishedDocumentAction } from '$/actions/documents/sharing/createPublishedDocumentAction'
import { updatePublishedDocumentAction } from '$/actions/documents/sharing/updatePublishedDocumentAction'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function usePublishedDocuments(
  {
    projectId,
    onCreated,
  }: { projectId: number; onCreated?: (document: PublishedDocument) => void },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const fetcher = useFetcher(
    ROUTES.api.projects.detail(projectId).publishedDocuments.root,
  )
  const {
    data = [],
    mutate,
    isLoading,
  } = useSWR<PublishedDocument[]>(
    ['publishedDocuments', projectId],
    fetcher,
    opts,
  )
  const { execute: create, isPending: isCreating } = useLatitudeAction(
    createPublishedDocumentAction,
    {
      onSuccess: ({ data: publishedDocument }) => {
        toast({
          title: 'Success',
          description:
            'Document published successfully. Share the link with others.',
        })
        onCreated?.(publishedDocument)
        mutate([...data, publishedDocument])
      },
    },
  )

  const { execute: update, isPending: isUpdating } = useLatitudeAction(
    updatePublishedDocumentAction,
    {
      onSuccess: ({ data: publishedDocument }) => {
        mutate([...data, publishedDocument])
      },
    },
  )

  const findByDocumentUuid = useCallback(
    (documentUuid: string) => data.find((d) => d.documentUuid === documentUuid),
    [data],
  )
  const find = useCallback(
    (uuid: string) => data.find((d) => d.uuid === uuid),
    [data],
  )

  return {
    data,
    isLoading,
    find,
    findByDocumentUuid,
    create,
    isCreating,
    update,
    isUpdating,
  }
}
