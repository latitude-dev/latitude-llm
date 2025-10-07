import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
} from '@latitude-data/core/schema/types'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useMemo } from 'react'
import { TriggerEventsList } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggerEventsList'
import { OnRunTriggerFn } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggersList'
import { useTriggerInfo } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggersCard'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import useDocumentVersions from '$/stores/documentVersions'
import {
  isChatTrigger,
  RUNNABLE_TRIGGERS,
} from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggerWrapper'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

function isIntegrationTrigger(
  trigger: DocumentTrigger,
): trigger is DocumentTrigger<DocumentTriggerType.Integration> {
  return trigger.triggerType === DocumentTriggerType.Integration
}

export function RunTrigger({
  trigger,
  integrations,
  onRunTrigger,
  onRunChatTrigger,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: () => void
}) {
  const { commit } = useCurrentCommit()
  const { data: documents } = useDocumentVersions({
    projectId: trigger.projectId,
    commitUuid: commit.uuid,
  })

  const document = useMemo<DocumentVersion | undefined>(
    () => documents?.find((d) => d.documentUuid === trigger.documentUuid),
    [documents, trigger.documentUuid],
  )

  // Loading documents. Triggers always should have a document linked
  if (!document) return null

  return (
    <RunTriggerWrapper
      trigger={trigger}
      integrations={integrations}
      document={document}
      onRunTrigger={onRunTrigger}
      onRunChatTrigger={onRunChatTrigger}
    />
  )
}

export function RunTriggerWrapper({
  trigger,
  integrations,
  document,
  onRunTrigger,
  onRunChatTrigger,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  document: DocumentVersion
  onRunTrigger: OnRunTriggerFn
  onRunChatTrigger: () => void
}) {
  const { image, title, description } = useTriggerInfo({
    trigger,
    document,
    integrations,
  })
  const canRunTrigger = RUNNABLE_TRIGGERS.includes(trigger.triggerType)

  const handleRunTrigger = useCallback(() => {
    if (isIntegrationTrigger(trigger)) {
      onRunTrigger({ document, parameters: {}, aiParameters: true })
      return
    }

    if (isChatTrigger(trigger)) {
      onRunChatTrigger()
      return
    }

    // Schedule triggers don't have parameters
    onRunTrigger({ document, parameters: {} })
  }, [onRunTrigger, onRunChatTrigger, trigger, document])

  return (
    <div className='flex flex-col relative border rounded-lg w-full'>
      <div
        className={cn(
          'w-full p-4 flex flex-row items-start justify-between gap-4 border-b border-border',
        )}
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
              {description ? (
                <Text.H5 color='foregroundMuted' ellipsis noWrap>
                  {description}
                </Text.H5>
              ) : null}
            </div>
          </div>
        </div>
        {canRunTrigger ? (
          <Button
            fancy
            variant='outline'
            iconProps={{ name: 'circlePlay' }}
            onClick={handleRunTrigger}
          >
            Run
          </Button>
        ) : null}
        {trigger.triggerType === DocumentTriggerType.Integration ? (
          <Button
            fancy
            variant='outline'
            iconProps={{ name: 'bot' }}
            onClick={handleRunTrigger}
          >
            Simulate with AI
          </Button>
        ) : null}
      </div>
      {!RUNNABLE_TRIGGERS.includes(trigger.triggerType) ? (
        <TriggerEventsList
          document={document}
          trigger={trigger}
          onRunTrigger={onRunTrigger}
          emptyState={<TriggerEventsEmptyState title={title} />}
        />
      ) : null}
    </div>
  )
}

function TriggerEventsEmptyState({ title }: { title: string }) {
  return (
    <div className='flex items-center justify-center '>
      <div className='flex flex-col items-center justify-center py-4 px-5 gap-y-3'>
        <Icon name='clockFading' size='large' color='foregroundMuted' />
        <Text.H5M>Waiting for events...</Text.H5M>
        <Text.H5 centered color='foregroundMuted'>
          To use this trigger to preview your agent, perform the action that
          triggers <Text.H5M color='foregroundMuted'>{title}</Text.H5M>.
        </Text.H5>
      </div>
    </div>
  )
}
