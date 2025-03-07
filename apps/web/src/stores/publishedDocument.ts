import { useCallback, useMemo } from 'react'

import {
  HEAD_COMMIT,
  type PublishedDocument,
} from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createPublishedDocumentAction } from '$/actions/documents/sharing/createPublishedDocumentAction'
import {
  updatePublishedDocumentAction,
  UpdatePublishedDocumentInput,
} from '$/actions/documents/sharing/updatePublishedDocumentAction'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY = [] as const
export default function usePublishedDocument(
  { projectId, documentUuid }: { projectId: number; documentUuid: string },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const fetcher = useFetcher(
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
          description:
            'Document published successfully. Share the link with others.',
        })
        mutate([...publishedDocuments, publishedDocument])
      },
    },
  )

  const { execute: executeUpdate, isPending: isUpdating } = useLatitudeAction(
    updatePublishedDocumentAction,
    {
      onSuccess: ({ data: publishedDocument }) => {
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

  const setPublished = useCallback(
    (visibility: boolean) => {
      if (isLoading) return
      if (!visibility && !data) return // published does not exist, nothing to do here
      if (data?.isPublished === visibility) return // already in desired state

      if (!data) {
        return create({ projectId, documentUuid, commitUuid: HEAD_COMMIT })
      }

      update({ isPublished: visibility })
    },
    [create, data, isLoading, update, projectId, documentUuid],
  )

  return {
    data,
    isLoading,
    create,
    isCreating,
    isPublished,
    setPublished,
    isPublishing: isCreating || isUpdating,
    update,
    isUpdating,
  }
}
