import { DocumentTrigger, HEAD_COMMIT } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { createDocumentTriggerAction } from '$/actions/documents/triggers/createDocumentTriggerAction'
import { deleteDocumentTriggerAction } from '$/actions/documents/triggers/deleteDocumentTriggerAction'
import {
  DocumentTriggerConfiguration,
  DocumentTriggerWithConfiguration,
} from '@latitude-data/core/services/documentTriggers/helpers/schema'
import { useCallback } from 'react'
import { updateDocumentTriggerConfigurationAction } from '$/actions/documents/triggers/updateDocumentTriggerConfigurationAction'

const EMPTY_ARRAY = [] as const
export default function useDocumentTriggers(
  { projectId, documentUuid }: { projectId: number; documentUuid: string },
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const fetcher = useFetcher(
    ROUTES.api.projects.detail(projectId).documents.detail(documentUuid)
      .triggers.root,
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
      },
    },
  )

  const { execute: executeUpdate, isPending: isUpdating } = useLatitudeAction(
    updateDocumentTriggerConfigurationAction,
    {
      onSuccess: ({ data: updatedTrigger }) => {
        mutate([
          ...data.filter((t) => t.id !== updatedTrigger.id),
          updatedTrigger,
        ])
      },
    },
  )

  const { execute: executeDelete, isPending: isDeleting } = useLatitudeAction(
    deleteDocumentTriggerAction,
    {
      onSuccess: ({ data: deletedTrigger }) => {
        mutate(data.filter((t) => t.id !== deletedTrigger.id))
      },
    },
  )

  const create = useCallback(
    ({ triggerType, configuration }: DocumentTriggerWithConfiguration) =>
      executeCreate({
        projectId,
        documentUuid,
        commitUuid: HEAD_COMMIT,
        triggerType,
        configuration,
      }),
    [executeCreate, documentUuid, projectId],
  )

  const update = useCallback(
    ({
      documentTrigger,
      configuration,
    }: {
      documentTrigger: DocumentTrigger
      configuration: DocumentTriggerConfiguration
    }) => {
      executeUpdate({
        documentUuid,
        projectId,
        commitUuid: HEAD_COMMIT,
        documentTriggerId: documentTrigger.id,
        configuration,
      })
    },
    [executeUpdate, documentUuid, projectId],
  )

  const deleteFn = useCallback(
    (documentTrigger: DocumentTrigger) => {
      executeDelete({
        documentUuid,
        projectId,
        commitUuid: HEAD_COMMIT,
        documentTriggerId: documentTrigger.id,
      })
    },
    [executeDelete, documentUuid, projectId],
  )

  return {
    data,
    isLoading,
    create,
    isCreating,
    update,
    isUpdating,
    delete: deleteFn,
    isDeleting,
  }
}
