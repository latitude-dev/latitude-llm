import { useCallback, useMemo } from 'react'

import { createPublishedDocumentAction } from '$/actions/documents/sharing/createPublishedDocumentAction'
import { publishDocumentAction } from '$/actions/documents/sharing/publishDocumentAction'
import {
  updatePublishedDocumentAction,
  UpdatePublishedDocumentInput,
} from '$/actions/documents/sharing/updatePublishedDocumentAction'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import {
  HEAD_COMMIT,
  type PublishedDocument,
} from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY = [] as const
export default function usePublishedDocument(
  { projectId, documentUuid }: { projectId: number; documentUuid: string },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const fetcher = useFetcher<PublishedDocument[]>(
    ROUTES.api.projects.detail(projectId).publishedDocuments.root,
  )

  const {
    data: publishedDocuments = EMPTY_ARRAY,
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
          description: 'Document published successfully.',
        })
        mutate([...publishedDocuments, publishedDocument])
      },
    },
  )

  const { execute: executeUpdate, isPending: isUpdating } = useLatitudeAction(
    updatePublishedDocumentAction,
    {
      onSuccess: ({ data: publishedDocument }) => {
        toast({
          title: 'Success',
          description: 'Document updated successfully.',
        })

        mutate([...publishedDocuments, publishedDocument])
      },
    },
  )

  const data = useMemo(
    () => publishedDocuments.find((d) => d.documentUuid === documentUuid),
    [publishedDocuments, documentUuid],
  )
  const isPublished = data?.isPublished ?? false

  const update = useCallback(
    (updateData: Omit<UpdatePublishedDocumentInput, 'uuid'>) =>
      executeUpdate({
        projectId,
        documentUuid,
        commitUuid: HEAD_COMMIT,
        uuid: data!.uuid!,
        ...updateData,
      }),
    [executeUpdate, projectId, documentUuid, data],
  )

  const { execute: publish, isPending: isPublishing } = useLatitudeAction(
    publishDocumentAction,
    {
      onSuccess: ({ data: publishedDocument }) => {
        toast({
          title: 'Success',
          description: 'Document published successfully.',
        })

        mutate((prev = []) => {
          const idx = prev?.findIndex((d) => d.uuid === publishedDocument.uuid)
          if (idx === undefined || idx < 0) return [...prev, publishedDocument]

          const newData = [...prev]
          newData[idx] = publishedDocument
          return newData
        })
      },
    },
  )

  return {
    data,
    isLoading,
    isPublished,
    create,
    isCreating,
    update,
    isUpdating,
    publish,
    isPublishing,
  }
}
