import { Commit, DocumentTrigger } from '@latitude-data/core/schema/types'
import { TriggerHeader } from './Header'
import { TriggerCardActions } from './Actions'
import useDocumentTriggerEvents from '$/stores/documentTriggerEvents'
import { TriggerEventsList } from './TriggerEventsList'
import { RUNNABLE_TRIGGERS, RunTriggerProps } from '../types'
import { DocumentTriggerStatus } from '@latitude-data/constants'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@latitude-data/web-ui/utils'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { EditTriggerModalContent, EditTriggerModalFooter } from '../EditTrigger'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentVersions from '$/stores/documentVersions'
import { useUpdateDocumentTrigger } from '../EditTrigger/useUpdateDocumentTrigger'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'

function EditTriggerModal({
  trigger,
  commit,
  isOpen,
  onClose,
}: {
  trigger?: DocumentTrigger
  commit: Commit
  isOpen: boolean
  onClose: () => void
}) {
  const { project } = useCurrentProject()

  const { data: documents } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })

  const document = useMemo(
    () => documents?.find((d) => d.documentUuid === trigger?.documentUuid),
    [documents, trigger?.documentUuid],
  )

  const {
    title,
    isLoading,
    isMerged,
    isDeleting,
    isUpdating,
    onDeleteTrigger,
    onUpdate,
    docSelection,
    setTriggerConfiguration,
  } = useUpdateDocumentTrigger({
    triggerUuid: trigger?.uuid,
    document,
    onClose,
  })

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      dismissible
      title={title}
      description='Edit the trigger configuration'
      footerAlign='justify'
      footer={
        <EditTriggerModalFooter
          withDeleteButton
          isMerged={isMerged}
          isDeleting={isDeleting}
          isUpdating={isUpdating}
          onDeleteTrigger={onDeleteTrigger}
          onUpdate={onUpdate}
        />
      }
    >
      <EditTriggerModalContent
        isLoading={isLoading}
        trigger={trigger}
        document={document}
        isMerged={isMerged}
        docSelection={docSelection}
        setTriggerConfiguration={setTriggerConfiguration}
        isUpdating={isUpdating}
      />
    </Modal>
  )
}

export function TriggerCard({
  trigger,
  commit,
  isOpen,
  onOpenChange,
  handleRun,
}: {
  trigger: DocumentTrigger
  commit: Commit
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  handleRun: (props: RunTriggerProps) => void
}) {
  const [newTriggerEventIds, setNewTriggerEventIds] = useState<number[]>([])

  const { data: triggerEvents, isLoading: isLoadingTriggerEvents } =
    useDocumentTriggerEvents({
      projectId: commit.projectId,
      commitUuid: commit.uuid,
      triggerUuid: trigger.uuid,
      onRealtimeTriggerEventCreated: (triggerEvent) => {
        setNewTriggerEventIds((prev) => [...prev, triggerEvent.id])
      },
    })

  const canSeeEvents = useMemo(
    () =>
      trigger.triggerStatus !== DocumentTriggerStatus.Pending &&
      !RUNNABLE_TRIGGERS.includes(trigger.triggerType),
    [trigger],
  )

  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (isOpen) return

    // list has just closed, we can clear the new event list
    setNewTriggerEventIds([])
  }, [isOpen])

  return (
    <>
      <div className='flex flex-col w-full relative'>
        {!isOpen && newTriggerEventIds.length > 0 ? (
          <div className='absolute top-0 right-0 translate-x-1/2 -translate-y-1/2'>
            <Badge
              size='large'
              className='rounded-full min-w-8 min-h-8 items-center justify-center flex px-2'
            >
              {newTriggerEventIds.length}
            </Badge>
          </div>
        ) : null}
        <div
          className={cn('flex flex-row items-start justify-between p-4', {
            'cursor-pointer hover:bg-secondary has-[button:hover]:bg-transparent':
              canSeeEvents,
          })}
          onClick={
            canSeeEvents
              ? (e) => {
                  // If clicked on a button, do nothing
                  if ((e.target as HTMLElement).closest('button')) return
                  onOpenChange(!isOpen)
                }
              : undefined
          }
        >
          <TriggerHeader trigger={trigger} commit={commit} />
          <div className='flex-grow min-w-0' />
          <TriggerCardActions
            trigger={trigger}
            commit={commit}
            isOpen={isOpen}
            handleRun={handleRun}
            onEdit={() => setIsEditing(true)}
          />
        </div>

        <TriggerEventsList
          trigger={trigger}
          triggerEvents={triggerEvents}
          newTriggerEventIds={newTriggerEventIds}
          isLoading={isLoadingTriggerEvents}
          isOpen={isOpen}
          handleRun={handleRun}
        />
      </div>
      <EditTriggerModal
        trigger={trigger}
        commit={commit}
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
      />
    </>
  )
}
