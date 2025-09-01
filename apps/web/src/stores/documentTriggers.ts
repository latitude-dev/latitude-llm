import { DocumentTrigger } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { createDocumentTriggerAction } from '$/actions/documents/triggers/createDocumentTriggerAction'
import { deleteDocumentTriggerAction } from '$/actions/documents/triggers/deleteDocumentTriggerAction'
import { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { useCallback, useMemo } from 'react'
import { updateDocumentTriggerConfigurationAction } from '$/actions/documents/triggers/updateDocumentTriggerConfigurationAction'
import { DocumentTriggerType } from '@latitude-data/constants'
import { toggleEnabledDocumentTriggerAction } from '$/actions/documents/triggers/toggleEnabledDocumentTriggerAction'

const EMPTY_ARRAY: DocumentTrigger[] = []
export default function useDocumentTriggers(
  {
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId: number
    commitUuid: string
    documentUuid?: string
  },
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
  const apiRoute = ROUTES.api.projects
    .detail(projectId)
    .commits.detail(commitUuid).triggers.root
  const searchParams: Record<string, string> = documentUuid
    ? { documentUuid }
    : {}
  const fetcher = useFetcher<DocumentTrigger[]>(apiRoute, {
    searchParams,
  })

  const {
    data = EMPTY_ARRAY,
    mutate,
    isLoading,
  } = useSWR<DocumentTrigger[]>(
    ['documentTriggers', projectId, commitUuid, documentUuid],
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

  const { execute: toggleEnabled, isPending: isEnabling } = useLatitudeAction(
    toggleEnabledDocumentTriggerAction,
    {
      onSuccess: ({ data: updatedTrigger }) => {
        mutate(
          data
            ? data.map((t) => (t.id === updatedTrigger.id ? updatedTrigger : t))
            : [updatedTrigger],
          false,
        )
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
    <T extends DocumentTriggerType>({
      documentUuid,
      triggerType,
      configuration,
    }: {
      documentUuid: string
      triggerType: T
      configuration: DocumentTriggerConfiguration<T>
    }) =>
      executeCreate({
        projectId,
        documentUuid,
        commitUuid,
        triggerType,
        configuration,
      }),
    [executeCreate, projectId, commitUuid],
  )

  // TODO: Remove, unnecessary wrap
  const update = useCallback(
    <T extends DocumentTriggerType>({
      documentTriggerUuid,
      configuration,
      documentUuid,
    }: {
      documentTriggerUuid: string
      documentUuid?: string
      configuration: DocumentTriggerConfiguration<T>
    }) => {
      executeUpdate({
        projectId,
        commitUuid,
        documentTriggerUuid,
        configuration,
        documentUuid,
      })
    },
    [executeUpdate, projectId, commitUuid],
  )

  // TODO: Remove, unnecessary wrap
  const deleteFn = useCallback(
    (documentTrigger: DocumentTrigger) => {
      executeDelete({
        projectId,
        commitUuid,
        documentTriggerUuid: documentTrigger.uuid,
      })
    },
    [executeDelete, projectId, commitUuid],
  )

  return useMemo(
    () => ({
      data,
      mutate,
      isLoading,
      create,
      isCreating,
      update,
      isUpdating,
      delete: deleteFn,
      isDeleting,
      toggleEnabled,
      isEnabling,
    }),
    [
      data,
      mutate,
      isLoading,
      create,
      isCreating,
      update,
      isUpdating,
      deleteFn,
      isDeleting,
      toggleEnabled,
      isEnabling,
    ],
  )
}
