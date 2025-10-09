import { useEffect, useMemo, useState } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentTriggers from '$/stores/documentTriggers'
import useDocumentVersions from '$/stores/documentVersions'
import { DocumentTriggerType } from '@latitude-data/constants'
import { useDocumentSelection } from '../components/SelectDocument'
import { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { DocumentVersion } from '@latitude-data/core/schema/types'

export function useUpdateDocumentTrigger({
  triggerUuid,
  onClose,
  document,
}: {
  triggerUuid: string
  onClose: () => void
  document?: DocumentVersion
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions({
      commitUuid: commit.uuid,
      projectId: project.id,
    })
  const {
    update,
    isUpdating,
    data,
    isLoading: isLoadingTriggers,
    delete: deleteTrigger,
    isDeleting,
  } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document?.documentUuid,
    },
    {
      onUpdated: onClose,
      onDeleted: onClose,
    },
  )
  const [configuration, setTriggerConfiguration] =
    useState<DocumentTriggerConfiguration<DocumentTriggerType> | null>(null)
  const isLoading = isLoadingTriggers || isLoadingDocuments
  const trigger = useMemo(
    () => data.find((trigger) => trigger.uuid === triggerUuid),
    [data, triggerUuid],
  )
  const docSelection = useDocumentSelection({
    initialDocumentUuid: trigger?.documentUuid,
  })

  useEffect(() => {
    if (isLoading) return
    if (trigger) return

    // Close modal if trigger is not found
    onClose()
  }, [trigger, isLoading, onClose])

  return useMemo(() => {
    const document = trigger
      ? (documents ?? [])?.find(
          (doc) => doc.documentUuid === trigger.documentUuid,
        )
      : null
    return {
      trigger,
      title: isLoading ? 'Edit' : `Edit ${trigger?.triggerType} trigger`,
      document,
      isMerged: !!commit.mergedAt,
      isLoading,
      update,
      isUpdating,
      configuration,
      docSelection,
      setTriggerConfiguration,
      onDeleteTrigger: () => {
        if (!trigger) return

        deleteTrigger(trigger)
      },
      onUpdate: () => {
        if (!trigger) return

        let data: {
          documentTriggerUuid: string
          configuration: DocumentTriggerConfiguration<DocumentTriggerType>
          documentUuid?: string
        } = {
          documentTriggerUuid: trigger.uuid,
          configuration: configuration ?? trigger.configuration,
        }

        if (docSelection.document) {
          data = { ...data, documentUuid: docSelection.document.documentUuid }
        }

        update(data)
      },
      isDeleting,
    }
  }, [
    configuration,
    docSelection,
    setTriggerConfiguration,
    trigger,
    update,
    isLoading,
    isUpdating,
    commit.mergedAt,
    documents,
    deleteTrigger,
    isDeleting,
  ])
}

export type UseUpdateDocumentTrigger = ReturnType<
  typeof useUpdateDocumentTrigger
>
