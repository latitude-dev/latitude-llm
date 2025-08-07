import { createDocumentTriggerAction } from '$/actions/documents/triggers/createDocumentTriggerAction'
import { deleteDocumentTriggerAction } from '$/actions/documents/triggers/deleteDocumentTriggerAction'
import { updateDocumentTriggerConfigurationAction } from '$/actions/documents/triggers/updateDocumentTriggerConfigurationAction'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import {
  DocumentTriggerConfiguration,
  InsertDocumentTriggerWithConfiguration,
} from '@latitude-data/constants/documentTriggers'
import { DocumentTrigger, HEAD_COMMIT } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback, useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY = [] as const
export default function useDocumentTriggers(
  { projectId, documentUuid }: { projectId: number; documentUuid?: string },
  {
    onCreated,
    onUpdated,
    onDeleted,
    ...opts
  }: SWRConfiguration & {
    onCreated?: (createdDocumentTrigger: DocumentTrigger) => void
    onUpdated?: (updatedDocumentTrigger: DocumentTrigger) => void
    onDeleted?: (deletedDocumentTrigger: DocumentTrigger) => void
  } = {},
) {
  const { toast } = useToast()
  const fetcher = useFetcher<DocumentTrigger[]>(
    documentUuid
      ? `${ROUTES.api.projects.detail(projectId).triggers.root}?documentUuid=${documentUuid}`
      : ROUTES.api.projects.detail(projectId).triggers.root,
  )

  const {
    data = EMPTY_ARRAY,
    mutate,
    isLoading,
  } = useSWR<DocumentTrigger[]>(
    ['documentTriggers', projectId, documentUuid],
    fetcher,
    opts,
  )

  const { execute: executeCreate, isPending: isCreating } = useLatitudeAction(
    createDocumentTriggerAction,
    {
      onSuccess: ({ data: createdDocumentTrigger }) => {
        toast({
          title: 'Success',
          description: 'Created a new document trigger successfully.',
        })
        mutate([...data, createdDocumentTrigger])
        onCreated?.(createdDocumentTrigger)
      },
      onError: ({ err }) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Failed to create document trigger: ${err.message}`,
        })
      },
    },
  )

  const { execute: executeUpdate, isPending: isUpdating } = useLatitudeAction(
    updateDocumentTriggerConfigurationAction,
    {
      onSuccess: ({ data: updatedTrigger }) => {
        toast({
          title: 'Success',
          description: 'Updated the document trigger successfully.',
        })

        mutate([
          ...data.filter((t) => t.id !== updatedTrigger.id),
          updatedTrigger,
        ])
        onUpdated?.(updatedTrigger)
      },
    },
  )

  const { execute: executeDelete, isPending: isDeleting } = useLatitudeAction(
    deleteDocumentTriggerAction,
    {
      onSuccess: ({ data: deletedTrigger }) => {
        toast({
          title: 'Success',
          description: 'Deleted the document trigger successfully.',
        })

        mutate(data.filter((t) => t.id !== deletedTrigger.id))
        onDeleted?.(deletedTrigger)
      },
    },
  )

  // TODO: Remove, unnecessary wrap
  const create = useCallback(
    ({
      documentUuid,
      trigger: { type, configuration },
    }: {
      documentUuid: string
      trigger: InsertDocumentTriggerWithConfiguration
    }) =>
      executeCreate({
        projectId,
        documentUuid,
        commitUuid: HEAD_COMMIT,
        trigger: {
          type,
          configuration,
        },
      }),
    [executeCreate, projectId],
  )

  // TODO: Remove, unnecessary wrap
  const update = useCallback(
    ({
      documentUuid,
      documentTrigger,
      configuration,
    }: {
      documentUuid: string
      documentTrigger: DocumentTrigger
      configuration: DocumentTriggerConfiguration
    }) => {
      executeUpdate({
        projectId,
        documentUuid,
        commitUuid: HEAD_COMMIT,
        documentTriggerId: documentTrigger.id,
        configuration,
      })
    },
    [executeUpdate, projectId],
  )

  // TODO: Remove, unnecessary wrap
  const deleteFn = useCallback(
    (documentTrigger: DocumentTrigger) => {
      executeDelete({
        projectId,
        documentUuid: documentTrigger.documentUuid,
        commitUuid: HEAD_COMMIT,
        documentTriggerId: documentTrigger.id,
      })
    },
    [executeDelete, projectId],
  )

  return useMemo(
    () => ({
      data,
      isLoading,
      create,
      isCreating,
      update,
      isUpdating,
      delete: deleteFn,
      isDeleting,
    }),
    [
      data,
      isLoading,
      create,
      isCreating,
      update,
      isUpdating,
      deleteFn,
      isDeleting,
    ],
  )
}
