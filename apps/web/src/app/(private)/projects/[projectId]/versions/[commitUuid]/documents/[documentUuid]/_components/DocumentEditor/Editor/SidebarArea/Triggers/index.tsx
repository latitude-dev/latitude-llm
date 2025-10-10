import { useCallback, useMemo, useState } from 'react'
import { useToggleModal } from '$/hooks/useToogleModal'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { NewTrigger } from '$/components/TriggersManagement/NewTrigger'
import {
  EditTriggerModalContent,
  EditTriggerModalFooter,
} from '$/components/TriggersManagement/EditTrigger'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentTriggers from '$/stores/documentTriggers'
import useIntegrations from '$/stores/integrations'
import {
  DocumentVersion,
  DocumentTrigger,
  IntegrationDto,
} from '@latitude-data/core/schema/types'
import { useTriggerInfo } from '$/components/TriggersManagement/hooks/useTriggerInfo'
import { DocumentTriggerType } from '@latitude-data/constants'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useUpdateDocumentTrigger } from '$/components/TriggersManagement/EditTrigger/useUpdateDocumentTrigger'
import { SidebarSection } from '../Section'
import { SectionItem } from '../SectionItem'

function NewTriggerModal({
  modalOpen,
  onCloseModal,
  onTriggerCreated,
  document,
}: {
  modalOpen: boolean
  onCloseModal: () => void
  onTriggerCreated: () => void
  document: DocumentVersion
}) {
  return (
    <Modal
      open={modalOpen}
      dismissible
      scrollable={false}
      size='xl'
      height='screen'
      title='Add new trigger'
      description='Add a new trigger to run this project automatically'
      onOpenChange={onCloseModal}
    >
      <NewTrigger onTriggerCreated={onTriggerCreated} document={document} />
    </Modal>
  )
}

function EditTriggerModal({
  triggerUuid,
  document,
  onClose,
}: {
  triggerUuid: string
  document: DocumentVersion
  onClose: () => void
}) {
  const updater = useUpdateDocumentTrigger({
    triggerUuid,
    document,
    onClose,
  })
  return (
    <Modal
      open={!!triggerUuid}
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
        canChangeDocument={false}
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
function TriggerItem({
  trigger,
  integrations,
  document,
  onClick,
  disabled,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  document: DocumentVersion
  onClick: (trigger: DocumentTrigger) => () => void
  disabled?: boolean
}) {
  const {
    image,
    title: titleInfo,
    description: descriptionInfo,
    integration,
  } = useTriggerInfo({
    trigger,
    document,
    integrations,
    imageSize: 'small',
  })
  const title =
    trigger.triggerType === DocumentTriggerType.Integration
      ? (integration?.name ?? titleInfo)
      : titleInfo
  const description =
    trigger.triggerType === DocumentTriggerType.Integration
      ? titleInfo
      : descriptionInfo

  return (
    <button
      onClick={onClick(trigger)}
      className='flex w-full'
      disabled={disabled}
    >
      <SectionItem title={title} description={description} image={image} />
    </button>
  )
}

export function useDocumentTriggersData() {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()
  const { data: triggers, isLoading: isLoadingTriggers } = useDocumentTriggers(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
    },
    {
      keepPreviousData: true,
    },
  )
  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations()
  const isLoading = isLoadingTriggers || isLoadingIntegrations
  return useMemo(
    () => ({
      triggers,
      integrations,
      document,
      isLoading,
    }),
    [triggers, integrations, isLoading, document],
  )
}

export function TriggersSidebarSection({
  triggers,
  integrations,
  document,
}: {
  triggers: DocumentTrigger[]
  integrations: IntegrationDto[]
  document: DocumentVersion
}) {
  const { commit } = useCurrentCommit()
  const isLive = !!commit.mergedAt
  const { open, onOpen, onClose } = useToggleModal()
  const [editingTrigger, setEditingTrigger] = useState<DocumentTrigger | null>(
    null,
  )
  const actions = useMemo(
    () => [{ onClick: onOpen, disabled: isLive }],
    [onOpen, isLive],
  )
  const onClickEdit = useCallback(
    (trigger: DocumentTrigger) => () => {
      setEditingTrigger(trigger)
    },
    [],
  )
  const onCloseEdit = useCallback(() => {
    setEditingTrigger(null)
  }, [])
  return (
    <>
      <SidebarSection title='Triggers' actions={actions}>
        <div>
          {triggers.map((trigger) => (
            <TriggerItem
              key={trigger.uuid}
              trigger={trigger}
              integrations={integrations}
              document={document}
              onClick={onClickEdit}
              disabled={isLive}
            />
          ))}
        </div>
      </SidebarSection>
      <NewTriggerModal
        modalOpen={open}
        onCloseModal={onClose}
        onTriggerCreated={onClose}
        document={document}
      />
      {editingTrigger ? (
        <EditTriggerModal
          triggerUuid={editingTrigger.uuid}
          onClose={onCloseEdit}
          document={document}
        />
      ) : null}
    </>
  )
}
