import useDocumentTriggerEvents from '$/stores/documentTriggerEvents'
import type {
  DocumentTrigger,
  DocumentTriggerEvent,
  DocumentVersion,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui/providers'
import { relativeTimeForDate } from '$/lib/relativeTime'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import type { OnRunTriggerFn } from '../TriggersList'
import { useCallback } from 'react'
import { getDocumentTriggerEventRunParameters } from '@latitude-data/core/services/documentTriggers/triggerEvents/getDocumentTriggerRunParameters'

const LOADING_BLOCKS = Array.from({ length: 3 })

function LoadingTriggerEvents() {
  return (
    <ul className='divide-y divide-border'>
      {LOADING_BLOCKS.map((_, i) => (
        <li key={i}>
          <div className='flex items-center justify-between p-4'>
            <Skeleton height='h5' className='w-40' />
            <Button fancy variant='outline' iconProps={{ name: 'circlePlay' }} disabled>
              Run
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function TriggerEventsEmptyState() {
  return (
    <div className='flex items-center justify-center '>
      <div className='flex flex-col items-center justify-center py-24 gap-y-3 max-w-80'>
        <Icon name='clockFading' size='large' color='foregroundMuted' />
        <Text.H5M>Waiting for events...</Text.H5M>
        <Text.H5 centered color='foregroundMuted'>
          To use this trigger to preview your agent, perform the action that triggers New user
          mention
        </Text.H5>
      </div>
    </div>
  )
}

export function TriggerEventsList({
  trigger,
  document,
  onRunTrigger,
}: {
  trigger: DocumentTrigger
  document: DocumentVersion
  onRunTrigger: OnRunTriggerFn
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: triggerEvents, isLoading } = useDocumentTriggerEvents({
    projectId: project.id,
    commitUuid: commit.uuid,
    triggerUuid: trigger.uuid,
  })
  const handleRunTrigger = useCallback(
    (event: DocumentTriggerEvent) => () => {
      const parameters = getDocumentTriggerEventRunParameters({
        documentTrigger: trigger,
        documentTriggerEvent: event,
      })
      // `parameters` only can be `null` when the trigger type is not known. Not an issue here
      onRunTrigger({ document, parameters: parameters ?? {} })
    },
    [onRunTrigger, document, trigger],
  )

  if (isLoading) {
    return <LoadingTriggerEvents />
  }

  if (triggerEvents.length === 0) {
    return <TriggerEventsEmptyState />
  }

  return (
    <ul className='divide-y divede-border max-h-80 overflow-y-auto custom-scrollbar scrollable-indicator'>
      {triggerEvents.map((event) => (
        <li key={event.id}>
          <div className='flex items-center justify-between p-4'>
            <Text.H5>{relativeTimeForDate(event.createdAt)}</Text.H5>
            <Button
              fancy
              variant='outline'
              iconProps={{ name: 'circlePlay' }}
              onClick={handleRunTrigger(event)}
            >
              Run
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
