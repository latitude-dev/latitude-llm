import { ROUTES } from '$/services/routes'
import useDocumentTriggers from '$/stores/documentTriggers'
import {
  DocumentTriggerStatus,
  DocumentTriggerType,
  HEAD_COMMIT,
} from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { MouseEvent, ReactNode, useCallback, useMemo } from 'react'
import { TriggerEventsList } from '../TriggerEventsList'
import { OnRunTriggerFn } from '../TriggersList'
import { OnRunChatTrigger } from '../useActiveTrigger'
import { realtimeTriggerEventsCounters } from '../useTriggerSockets'
import { useParams } from 'next/navigation'
import {
  DocumentTrigger,
  DocumentVersion,
  PipedreamIntegration,
} from '@latitude-data/core/schema/types'

function ToggleEnabled({
  projectId,
  commitUuid,
  isMerged,
  trigger,
}: {
  projectId: number
  commitUuid: string
  isMerged: boolean
  trigger: DocumentTrigger
}) {
  const { toggleEnabled, isEnabling } = useDocumentTriggers({
    projectId,
    commitUuid,
  })
  const onToggleEnabled = useCallback(() => {
    toggleEnabled({
      projectId,
      commitUuid,
      triggerUuid: trigger.uuid,
      enabled: !trigger.enabled,
    })
  }, [toggleEnabled, projectId, commitUuid, trigger.uuid, trigger.enabled])
  const toogleComp = (
    <SwitchToggle
      disabled={!isMerged || isEnabling}
      checked={trigger.enabled}
      onCheckedChange={onToggleEnabled}
    />
  )

  if (!isMerged) {
    return (
      <Tooltip asChild trigger={<div>{toogleComp}</div>}>
        A trigger can only be enabled or disabled in the Live commit
      </Tooltip>
    )
  }

  return toogleComp
}

function EditTriggerButton({
  projectId,
  commitUuid,
  trigger,
  isMerged,
}: {
  projectId: number
  commitUuid: string
  trigger: DocumentTrigger
  isMerged: boolean
}) {
  const { commitUuid: paramCommitUuid } = useParams()
  const isHead = paramCommitUuid === HEAD_COMMIT ? HEAD_COMMIT : null
  const editLink = useMemo(
    () =>
      ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: isHead ? HEAD_COMMIT : commitUuid })
        .preview.triggers.edit(trigger.uuid).root,
    [projectId, commitUuid, trigger.uuid, isHead],
  )

  return (
    <Link href={editLink}>
      <Button fancy variant='outline'>
        {isMerged ? 'View' : 'Edit'}
      </Button>
    </Link>
  )
}

function isChatTrigger(
  trigger: DocumentTrigger,
): trigger is DocumentTrigger<DocumentTriggerType.Chat> {
  return trigger.triggerType === DocumentTriggerType.Chat
}

const RUNNABLE_TRIGGERS = [
  DocumentTriggerType.Scheduled,
  DocumentTriggerType.Chat,
]
export function TriggerWrapper({
  trigger,
  image,
  title,
  description,
  document,
  integration,
  isOpen,
  onOpen,
  onRunTrigger,
  onRunChatTrigger,
}: {
  trigger: DocumentTrigger
  image: ReactNode
  title: string
  description?: string
  document: DocumentVersion
  integration?: PipedreamIntegration
  isOpen: boolean
  onOpen: () => void
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: OnRunChatTrigger
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { eventsByTrigger, resetCounter } = realtimeTriggerEventsCounters(
    (state) => ({
      eventsByTrigger: state.eventsByTrigger,
      resetCounter: state.resetCounter,
    }),
  )
  const realtimeCount = eventsByTrigger[trigger.uuid] || 0

  const isMerged = !!commit.mergedAt
  const canSeeEvents =
    !RUNNABLE_TRIGGERS.includes(trigger.triggerType) &&
    trigger.triggerStatus !== DocumentTriggerStatus.Pending
  const canRunTrigger = RUNNABLE_TRIGGERS.includes(trigger.triggerType)
  const canEnable = trigger.triggerStatus === DocumentTriggerStatus.Deployed

  const documentName = useMemo(() => {
    const parts = document.path.split('/')
    if (parts.length <= 1) return document.path

    const first = parts[0]
    const last = parts[parts.length - 1]
    if (parts.length === 2) return document.path

    return `${first}/.../${last}`
  }, [document])

  const onToggleEventList = useCallback(() => {
    resetCounter(trigger.uuid)

    if (!canSeeEvents) return

    onOpen()
  }, [onOpen, trigger, canSeeEvents, resetCounter])

  const avoidOpenEvents = useCallback((e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
  }, [])

  const handleRunTrigger = useCallback(() => {
    if (isChatTrigger(trigger)) {
      onRunChatTrigger({ trigger, document })
      return
    }
  }, [onRunChatTrigger, trigger, document])
  const handleScheduleTriggerRun = useCallback(() => {
    handleRunTrigger()
  }, [handleRunTrigger])
  return (
    <div className='flex flex-col relative'>
      {realtimeCount > 0 ? (
        <div className='absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 z-10'>
          <Badge>{realtimeCount}</Badge>
        </div>
      ) : null}
      <div
        className={cn(
          'w-full p-4 flex flex-row items-start justify-between gap-4',
          {
            'border-b border-border': isOpen,
            'bg-latte-background':
              trigger.triggerStatus === DocumentTriggerStatus.Pending,
            'cursor-pointer': canSeeEvents,
          },
        )}
        onClick={onToggleEventList}
      >
        <div className='flex flex-row gap-4 min-w-0'>
          <div className='flex-none'>
            <div
              className={cn(
                'size-10 rounded-md bg-backgroundCode flex items-center justify-center overflow-hidden',
              )}
            >
              {image}
            </div>
          </div>
          <div className='flex flex-col gap-1 min-w-0'>
            <div className='flex flex-col min-w-0'>
              <Text.H4M ellipsis noWrap>
                {title}
              </Text.H4M>
              {trigger.triggerStatus === DocumentTriggerStatus.Pending ? (
                <Text.H5 color='latteOutputForeground' ellipsis noWrap>
                  Requires additional configuration
                </Text.H5>
              ) : description ? (
                <Text.H5 color='foregroundMuted' ellipsis noWrap>
                  {description}
                </Text.H5>
              ) : null}
            </div>
            {integration && (
              <Badge
                variant='muted'
                className='w-fit'
                noWrap
                ellipsis
                iconProps={{ name: 'userRound', placement: 'start' }}
              >
                {integration.name}
              </Badge>
            )}
            <div className='flex flex-row items-center justify-start'>
              <Link
                href={
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid })
                    .documents.detail({ uuid: document.documentUuid }).root
                }
              >
                <Tooltip
                  className='w-fit'
                  trigger={
                    <Badge
                      variant='accent'
                      iconProps={{ name: 'file', placement: 'start' }}
                      noWrap
                      ellipsis
                      className='w-fit'
                    >
                      {documentName}
                    </Badge>
                  }
                >
                  {document.path}
                </Tooltip>
              </Link>
            </div>
          </div>
        </div>
        <div className='flex-1 flex flex-row justify-end gap-x-4'>
          <div
            onClick={avoidOpenEvents}
            className='flex flex-row items-center gap-x-4 '
          >
            {canEnable ? (
              <ToggleEnabled
                projectId={project.id}
                commitUuid={commit.uuid}
                isMerged={isMerged}
                trigger={trigger}
              />
            ) : null}
            <div className='flex flex-row items-center gap-x-2'>
              {canRunTrigger ? (
                <Button
                  fancy
                  variant='outline'
                  iconProps={{ name: 'circlePlay' }}
                  onClick={handleScheduleTriggerRun}
                >
                  Run
                </Button>
              ) : null}
            </div>
            <EditTriggerButton
              projectId={project.id}
              commitUuid={commit.uuid}
              trigger={trigger}
              isMerged={isMerged}
            />
          </div>
          {canSeeEvents ? (
            <div className='min-h-button flex items-center justify-center'>
              <Icon
                name={isOpen ? 'chevronUp' : 'chevronDown'}
                color='foregroundMuted'
              />
            </div>
          ) : null}
        </div>
      </div>
      {isOpen ? (
        <TriggerEventsList
          document={document}
          trigger={trigger}
          onRunTrigger={onRunTrigger}
          emptyState={<TriggerEventsEmptyState />}
        />
      ) : null}
    </div>
  )
}

function TriggerEventsEmptyState() {
  return (
    <div className='flex items-center justify-center '>
      <div className='flex flex-col items-center justify-center py-20 gap-y-3 max-w-[400px]'>
        <Icon name='clockFading' size='large' color='foregroundMuted' />
        <Text.H5M>Waiting for events...</Text.H5M>
        <Text.H5 centered color='foregroundMuted'>
          There are no events for this trigger yet.
        </Text.H5>
        <Text.H5 centered color='foregroundMuted'>
          When the trigger receives an event, it will be listed here.
        </Text.H5>
      </div>
    </div>
  )
}
