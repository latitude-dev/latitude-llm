'use client'

import { useParams } from 'next/navigation'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useDocumentTriggers from '$/stores/documentTriggers'
import useDocumentVersions from '$/stores/documentVersions'
import { DocumentTriggerType, HEAD_COMMIT } from '@latitude-data/constants'
import { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { DocumentTrigger, DocumentVersion } from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EditEmailTrigger } from './_components/EmailTrigger'
import { EditIntegrationTrigger } from './_components/IntegrationTrigger'
import { EditScheduleTrigger } from './_components/ScheduleTrigger'
import {
  SelectDocument,
  useDocumentSelection,
} from '../../../(.)triggers/_components/SelectDocument'

function useDocumentTrigger({ triggerUuid }: { triggerUuid: string }) {
  const navigate = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { commitUuid: paramCommitUuid } = useParams()
  const isHead = paramCommitUuid === HEAD_COMMIT ? HEAD_COMMIT : null
  const { data: documents, isLoading: isLoadingDocuments } =
    useDocumentVersions({
      commitUuid: commit.uuid,
      projectId: project.id,
    })
  const previewPath = useMemo(
    () =>
      ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: isHead ? HEAD_COMMIT : commit.uuid }).preview
        .root,
    [project.id, commit.uuid, isHead],
  )
  const onCloseModal = useCallback(() => {
    navigate.push(previewPath, { scroll: false })
  }, [navigate, previewPath])
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
    },
    {
      onUpdated: onCloseModal,
      onDeleted: onCloseModal,
    },
  )
  const isLoading = isLoadingTriggers || isLoadingDocuments
  return useMemo(() => {
    const trigger = data.find((trigger) => trigger.uuid === triggerUuid)
    const document = trigger
      ? (documents ?? [])?.find(
          (doc) => doc.documentUuid === trigger.documentUuid,
        )
      : null
    return {
      trigger,
      document,
      isMerged: !!commit.mergedAt,
      isLoading,
      onCloseModal,
      update,
      isUpdating,
      onDeleteTrigger: () => {
        if (!trigger) return

        deleteTrigger(trigger)
      },
      isDeleting,
    }
  }, [
    data,
    update,
    triggerUuid,
    isLoading,
    onCloseModal,
    isUpdating,
    commit.mergedAt,
    documents,
    deleteTrigger,
    isDeleting,
  ])
}

function LoadingTrigger() {
  return (
    <div className='flex items-center justify-center min-h-36'>
      <Text.H5>Loading...</Text.H5>
    </div>
  )
}

export type EditTriggerProps<T extends DocumentTriggerType> = {
  trigger: DocumentTrigger<T>
  document: DocumentVersion
  setConfiguration: ReactStateDispatch<DocumentTriggerConfiguration<T> | null>
  isUpdating: boolean
}

function EditTrigger<T extends DocumentTriggerType>(
  props: EditTriggerProps<T>,
) {
  const type = props.trigger.triggerType

  if (type === DocumentTriggerType.Chat) return null

  if (type === DocumentTriggerType.Email) {
    return (
      <EditEmailTrigger
        {...(props as EditTriggerProps<DocumentTriggerType.Email>)}
      />
    )
  }

  if (type === DocumentTriggerType.Integration) {
    return (
      <EditIntegrationTrigger
        {...(props as EditTriggerProps<DocumentTriggerType.Integration>)}
      />
    )
  }

  if (type === DocumentTriggerType.Scheduled) {
    return (
      <EditScheduleTrigger
        {...(props as EditTriggerProps<DocumentTriggerType.Scheduled>)}
      />
    )
  }

  return <Text.H5>Unsupported trigger type: {type}</Text.H5>
}

export function EditTriggerModal({ triggerUuid }: { triggerUuid: string }) {
  const {
    update,
    trigger,
    document,
    isMerged,
    onCloseModal,
    isLoading,
    isUpdating,
    onDeleteTrigger,
    isDeleting,
  } = useDocumentTrigger({
    triggerUuid,
  })

  const [configuration, setTriggerConfiguration] =
    useState<DocumentTriggerConfiguration<DocumentTriggerType> | null>(null)
  const docSelection = useDocumentSelection({
    initialDocumentUuid: trigger?.documentUuid,
  })
  const onUpdate = useCallback(() => {
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
  }, [trigger, configuration, update, docSelection.document])

  useEffect(() => {
    if (isLoading) return
    if (trigger) return

    // Close modal if trigger is not found
    onCloseModal()
  }, [trigger, isLoading, onCloseModal])
  const footer = useMemo(() => {
    if (isMerged) return null

    return (
      <>
        <Button
          fancy
          disabled={isDeleting}
          variant='outlineDestructive'
          onClick={onDeleteTrigger}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
        <Button disabled={isUpdating} fancy onClick={onUpdate}>
          Update
        </Button>
      </>
    )
  }, [isMerged, isDeleting, onDeleteTrigger, isUpdating, onUpdate])

  return (
    <Modal
      open
      dismissible
      title={isLoading ? 'Edit' : `Edit ${trigger?.triggerType} trigger`}
      description='Edit the trigger configuration'
      onOpenChange={onCloseModal}
      footerAlign='justify'
      footer={footer}
    >
      {isLoading ? <LoadingTrigger /> : null}
      {trigger && document ? (
        <div className='space-y-4'>
          {isMerged ? (
            <Alert
              title='Live versions'
              description='You need to do a new version to edit this trigger'
              variant='warning'
            />
          ) : null}
          <div className={cn({ 'pointer-events-none opacity-60': isMerged })}>
            <FormWrapper>
              <SelectDocument
                onSelectDocument={docSelection.onSelectDocument}
                options={docSelection.options}
                document={docSelection.document}
              />
              <EditTrigger
                trigger={trigger}
                document={docSelection.document ?? document}
                setConfiguration={setTriggerConfiguration}
                isUpdating={isUpdating}
              />
            </FormWrapper>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
