import { DocumentTriggerType } from '@latitude-data/constants'
import {
  Commit,
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
} from '@latitude-data/core/schema/types'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useCallback, useMemo } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import useDocumentVersions from '$/stores/documentVersions'
import { useTriggerInfo } from '$/components/TriggersManagement/hooks/useTriggerInfo'
import {
  RunDocumentProps,
  RUNNABLE_TRIGGERS,
  RunTriggerProps,
} from '$/components/TriggersManagement/types'
import { TriggerEventsList } from '$/components/TriggersManagement/TriggerCard/TriggerEventsList'
import useDocumentTriggerEvents from '$/stores/documentTriggerEvents'

export function RunTrigger({
  trigger,
  integrations,
  onRunTrigger,
}: {
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  onRunTrigger: (props: RunDocumentProps) => void
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
      commit={commit}
      trigger={trigger}
      document={document}
      integrations={integrations}
      onRunTrigger={onRunTrigger}
    />
  )
}

function RunTriggerWrapper({
  commit,
  document,
  trigger,
  integrations,
  onRunTrigger,
}: {
  commit: Commit
  document: DocumentVersion
  trigger: DocumentTrigger
  integrations: IntegrationDto[]
  onRunTrigger: (props: RunDocumentProps) => void
}) {
  const { image, title, description } = useTriggerInfo({
    trigger,
    document,
    integrations,
  })
  const canRunTrigger = RUNNABLE_TRIGGERS.includes(trigger.triggerType)

  const { data: triggerEvents, isLoading: isLoadingTriggerEvents } =
    useDocumentTriggerEvents({
      projectId: trigger.projectId,
      commitUuid: commit.uuid,
      triggerUuid: trigger.uuid,
    })

  const handleRunScheduled = useCallback(() => {
    onRunTrigger({ document, parameters: {} })
  }, [onRunTrigger, document])

  const handleRunWithAI = useCallback(() => {
    onRunTrigger({ document, parameters: {}, aiParameters: true })
  }, [onRunTrigger, document])

  const handleRunFromEvent = useCallback(
    (props: RunTriggerProps) => {
      onRunTrigger({ document, ...props })
    },
    [onRunTrigger, document],
  )

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
            onClick={handleRunScheduled}
          >
            Run
          </Button>
        ) : null}
        {trigger.triggerType === DocumentTriggerType.Integration ? (
          <Button
            fancy
            variant='outline'
            iconProps={{ name: 'bot' }}
            onClick={handleRunWithAI}
          >
            Simulate with AI
          </Button>
        ) : null}
      </div>
      {!RUNNABLE_TRIGGERS.includes(trigger.triggerType) ? (
        <TriggerEventsList
          trigger={trigger}
          triggerEvents={triggerEvents}
          isLoading={isLoadingTriggerEvents}
          isOpen
          handleRun={handleRunFromEvent}
        />
      ) : null}
    </div>
  )
}
