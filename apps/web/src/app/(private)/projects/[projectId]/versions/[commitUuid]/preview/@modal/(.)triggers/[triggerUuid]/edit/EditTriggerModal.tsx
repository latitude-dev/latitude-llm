'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { ConfirmModal, Modal, CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import type { DocumentTrigger, DocumentVersion } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui/providers'
import useDocumentTriggers from '$/stores/documentTriggers'
import type { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import type { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { DeleteTriggerBanner } from './_components/DeleteTriggerBanner'
import { EditScheduleTrigger } from './_components/ScheduleTrigger'
import { EditEmailTrigger } from './_components/EmailTrigger'
import { EditIntegrationTrigger } from './_components/IntegrationTrigger'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import useDocumentVersions from '$/stores/documentVersions'

function useDocumentTrigger({ triggerUuid }: { triggerUuid: string }) {
  const navigate = useNavigate()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: documents, isLoading: isLoadingDocuments } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const previewPath = useMemo(
    () =>
      ROUTES.projects.detail({ id: project.id }).commits.detail({ uuid: commit.uuid }).preview.root,
    [project.id, commit.uuid],
  )
  const onCloseModal = useCallback(() => {
    navigate.push(previewPath)
  }, [navigate, previewPath])
  const {
    update,
    isUpdating,
    data,
    isLoading: isLoadingTriggers,
  } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
    },
    {
      onUpdated: onCloseModal,
    },
  )
  const isLoading = isLoadingTriggers || isLoadingDocuments
  return useMemo(() => {
    const trigger = data.find((trigger) => trigger.uuid === triggerUuid)
    const document = trigger
      ? (documents ?? [])?.find((doc) => doc.documentUuid === trigger.documentUuid)
      : null
    return {
      trigger,
      document,
      isLive: !!commit.mergedAt,
      isLoading,
      onCloseModal,
      update,
      isUpdating,
    }
  }, [data, update, triggerUuid, isLoading, onCloseModal, isUpdating, commit.mergedAt, documents])
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

function EditTrigger<T extends DocumentTriggerType>(props: EditTriggerProps<T>) {
  const type = props.trigger.triggerType

  if (type === DocumentTriggerType.Email) {
    return <EditEmailTrigger {...(props as EditTriggerProps<DocumentTriggerType.Email>)} />
  }

  if (type === DocumentTriggerType.Integration) {
    return (
      <EditIntegrationTrigger {...(props as EditTriggerProps<DocumentTriggerType.Integration>)} />
    )
  }

  if (type === DocumentTriggerType.Scheduled) {
    return <EditScheduleTrigger {...(props as EditTriggerProps<DocumentTriggerType.Scheduled>)} />
  }

  return <Text.H5>Unsupported trigger type: {type}</Text.H5>
}

export function EditTriggerModal({ triggerUuid }: { triggerUuid: string }) {
  const { update, trigger, document, isLive, onCloseModal, isLoading, isUpdating } =
    useDocumentTrigger({
      triggerUuid,
    })

  const [configuration, setTriggerConfiguration] =
    useState<DocumentTriggerConfiguration<DocumentTriggerType> | null>(null)

  const onUpdate = useCallback(() => {
    if (!trigger || !configuration) return

    update({
      documentTriggerUuid: trigger.uuid,
      configuration,
    })
  }, [trigger, configuration, update])

  useEffect(() => {
    if (isLoading) return
    if (trigger) return

    // Close modal if trigger is not found
    onCloseModal()
  }, [trigger, isLoading, onCloseModal])

  if (!isLive) {
    return (
      <Modal
        open
        dismissible
        title='Edit trigger'
        description='Edit the trigger configuration'
        onOpenChange={onCloseModal}
        footer={
          <>
            <CloseTrigger />
            <Button disabled={!configuration || isUpdating} fancy onClick={onUpdate}>
              Update trigger
            </Button>
          </>
        }
      >
        {isLoading ? <LoadingTrigger /> : null}
        {trigger && document ? (
          <FormWrapper>
            <DeleteTriggerBanner
              document={document}
              trigger={trigger}
              onCloseModal={onCloseModal}
            />
            <EditTrigger
              trigger={trigger}
              document={document}
              setConfiguration={setTriggerConfiguration}
              isUpdating={isUpdating}
            />
          </FormWrapper>
        ) : null}
      </Modal>
    )
  }

  // This is what user's see if they try to edit a trigger in a live commit.
  return (
    <ConfirmModal
      open
      dismissible
      type='default'
      title='Edit trigger'
      description='Edit the trigger configuration'
      onConfirm={onCloseModal}
      confirm={{
        label: 'Back to preview',
        description: 'Live triggers cannot be edited. Create a new version to delete this trigger.',
      }}
    />
  )
}
