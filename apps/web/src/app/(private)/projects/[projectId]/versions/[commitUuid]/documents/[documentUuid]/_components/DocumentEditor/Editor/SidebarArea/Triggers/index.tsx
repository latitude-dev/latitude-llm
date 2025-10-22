import { useCallback, useMemo, useState } from 'react'
import { useToggleModal } from '$/hooks/useToogleModal'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { NewTrigger } from '$/components/TriggersManagement/NewTrigger'
import {
  EditTriggerModalContent,
  EditTriggerModalFooter,
} from '$/components/TriggersManagement/EditTrigger'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentTriggers from '$/stores/documentTriggers'
import useIntegrations from '$/stores/integrations'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import { useTriggerInfo } from '$/components/TriggersManagement/hooks/useTriggerInfo'
import { DocumentTriggerType } from '@latitude-data/constants'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useUpdateDocumentTrigger } from '$/components/TriggersManagement/EditTrigger/useUpdateDocumentTrigger'
import { SidebarSection } from '../Section'
import { SelectionSubItem } from '../SelectionSubItem'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'

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
      footer={
        <Alert
          variant='warning'
          description='Triggers run only on published project versions'
          spacing='medium'
        />
      }
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
  onDelete,
  disabled,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  document: DocumentVersion
  onClick: (trigger: DocumentTrigger) => () => void
  onDelete: (trigger: DocumentTrigger) => void
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
    <SelectionSubItem
      icon={<div>{image}</div>}
      content={
        <div className='flex items-center min-w-0 gap-x-2'>
          <div className='flex shrink-0 max-w-40 min-w-0'>
            <Text.H5 ellipsis noWrap>
              {title}
            </Text.H5>
          </div>
          {description && (
            <div className='flex flex-1 min-w-0'>
              <Text.H5 ellipsis noWrap color='foregroundMuted'>
                {description}
              </Text.H5>
            </div>
          )}
        </div>
      }
      onClick={onClick(trigger)}
      disabled={disabled}
      actions={
        <DropdownMenu
          options={[
            {
              label: 'Delete',
              type: 'destructive',
              onClick: () => {
                onDelete(trigger)
              },
            },
          ]}
          side='bottom'
          align='end'
          triggerButtonProps={{
            iconProps: { name: 'ellipsis' },
            variant: 'ghost',
            size: 'none',
            disabled,
          }}
        />
      }
    />
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
  const { project } = useCurrentProject()
  const isLive = !!commit.mergedAt
  const { open, onOpen, onClose } = useToggleModal()
  const [editingTrigger, setEditingTrigger] = useState<DocumentTrigger | null>(
    null,
  )

  // Get delete function from useDocumentTriggers
  const { delete: deleteTrigger } = useDocumentTriggers({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })

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
  const onDeleteTrigger = useCallback(
    (trigger: DocumentTrigger) => {
      deleteTrigger(trigger)
    },
    [deleteTrigger],
  )
  const onCloseEdit = useCallback(() => {
    setEditingTrigger(null)
  }, [])
  return (
    <>
      <SidebarSection title='Triggers' actions={actions}>
        {triggers.map((trigger) => (
          <TriggerItem
            key={trigger.uuid}
            trigger={trigger}
            integrations={integrations}
            document={document}
            onClick={onClickEdit}
            onDelete={onDeleteTrigger}
            disabled={isLive}
          />
        ))}
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
