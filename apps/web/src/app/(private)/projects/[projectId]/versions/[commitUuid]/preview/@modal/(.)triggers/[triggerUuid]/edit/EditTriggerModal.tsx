'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useUpdateDocumentTrigger } from '$/components/TriggersManagement/EditTrigger/useUpdateDocumentTrigger'
import { ROUTES } from '$/services/routes'
import { HEAD_COMMIT } from '@latitude-data/constants'
import {
  EditTriggerModalContent,
  EditTriggerModalFooter,
} from '$/components/TriggersManagement/EditTrigger'

export type EditTriggerRouteParams = {
  projectId: string
  commitUuid: string
  triggerUuid: string
}
export function getRefirectUrlPath({
  projectId,
  commitUuid,
}: {
  projectId: string
  commitUuid: string
}) {
  const isHead = commitUuid === HEAD_COMMIT ? HEAD_COMMIT : null
  return ROUTES.projects
    .detail({ id: Number(projectId) })
    .commits.detail({ uuid: isHead ? HEAD_COMMIT : commitUuid }).preview.root
}

export function EditTriggerModal({
  projectId,
  commitUuid,
  triggerUuid,
}: {
  projectId: string
  commitUuid: string
  triggerUuid: string
}) {
  const router = useRouter()
  const onClose = useCallback(() => {
    const redirectPath = getRefirectUrlPath({ projectId, commitUuid })
    router.push(redirectPath)
  }, [router, projectId, commitUuid])
  const updater = useUpdateDocumentTrigger({
    triggerUuid,
    onClose,
  })
  return (
    <Modal
      open
      dismissible
      title={updater.title}
      description='Edit the trigger configuration'
      onOpenChange={onClose}
      footerAlign='justify'
      footer={
        <EditTriggerModalFooter
          withDeleteButton
          isMerged={updater.isMerged}
          isDeleting={updater.isDeleting}
          isUpdating={updater.isUpdating}
          onDeleteTrigger={updater.onDeleteTrigger}
          onUpdate={updater.onUpdate}
        />
      }
    >
      <EditTriggerModalContent
        isLoading={updater.isLoading}
        trigger={updater.trigger}
        document={updater.document}
        isMerged={updater.isMerged}
        docSelection={updater.docSelection}
        setTriggerConfiguration={updater.setTriggerConfiguration}
        isUpdating={updater.isUpdating}
      />
    </Modal>
  )
}
