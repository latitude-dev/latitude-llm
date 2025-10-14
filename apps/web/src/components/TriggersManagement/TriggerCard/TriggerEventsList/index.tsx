import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useCallback, useMemo } from 'react'
import { getDocumentTriggerEventRunParameters } from '@latitude-data/core/services/documentTriggers/triggerEvents/getDocumentTriggerRunParameters'
import { DocumentTriggerEventItem } from './TriggerEvent'
import {
  DocumentTrigger,
  DocumentTriggerEvent,
} from '@latitude-data/core/schema/types'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DocumentTriggerType } from '@latitude-data/constants'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { RunTriggerProps } from '../../types'

const LOADING_BLOCKS = Array.from({ length: 3 })

export function TriggerEventsEmptyState({
  triggerName,
}: {
  triggerName: string
}) {
  return (
    <div className='flex items-center justify-center p-4 pt-0'>
      <div className='flex flex-col items-center justify-center py-4 px-5 gap-2 border border-border rounded-xl border-dashed w-full'>
        <Icon name='clockFading' size='large' color='foregroundMuted' />
        <Text.H5M color='foregroundMuted'>Waiting for events...</Text.H5M>
        <Text.H5 centered color='foregroundMuted'>
          To use this trigger to preview your agent, perform the action that
          triggers <Text.H5M color='foregroundMuted'>{triggerName}</Text.H5M>.
        </Text.H5>
      </div>
    </div>
  )
}

export function LoadingTriggerEvents() {
  return (
    <ul className='divide-y divide-border'>
      {LOADING_BLOCKS.map((_, i) => (
        <li key={i}>
          <div className='flex items-center justify-between p-4'>
            <Skeleton height='h5' className='w-40' />
            <Button
              fancy
              variant='outline'
              iconProps={{ name: 'circlePlay' }}
              disabled
            >
              Run
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

const EMPTY_ARRAY = [] as number[]

export function TriggerEventsList({
  trigger,
  triggerEvents,
  newTriggerEventIds = EMPTY_ARRAY,
  isLoading,
  isOpen,
  handleRun,
}: {
  trigger: DocumentTrigger
  triggerEvents: DocumentTriggerEvent[]
  newTriggerEventIds?: number[]
  isLoading: boolean
  isOpen: boolean
  handleRun: (props: RunTriggerProps) => void
}) {
  const handleRunEvent = useCallback(
    (event: DocumentTriggerEvent) => () => {
      const parameters = getDocumentTriggerEventRunParameters({
        documentTrigger: trigger,
        documentTriggerEvent: event,
      })
      handleRun({
        trigger,
        parameters: parameters ?? {},
      })
    },
    [handleRun, trigger],
  )

  const triggerName = useMemo(() => {
    if (trigger.triggerType === DocumentTriggerType.Integration) {
      return (trigger.configuration as IntegrationTriggerConfiguration)
        .componentId
    }

    return trigger.triggerType
  }, [trigger])

  if (!isOpen) return null
  if (isLoading) return <LoadingTriggerEvents />
  if (triggerEvents.length === 0) {
    return <TriggerEventsEmptyState triggerName={triggerName} />
  }

  return (
    <ul className='divide-y divede-border max-h-80 overflow-y-auto custom-scrollbar scrollable-indicator border-t border-border'>
      {triggerEvents.map((event) => (
        <li key={event.id}>
          <DocumentTriggerEventItem
            event={event}
            handleRunEvent={handleRunEvent}
            isNew={newTriggerEventIds.includes(event.id)}
          />
        </li>
      ))}
    </ul>
  )
}
