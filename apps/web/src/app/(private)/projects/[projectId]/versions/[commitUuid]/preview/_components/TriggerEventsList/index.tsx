import useDocumentTriggerEvents from '$/stores/documentTriggerEvents'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { OnRunTriggerFn } from '../TriggersList'
import { ReactNode, useCallback } from 'react'
import { getDocumentTriggerEventRunParameters } from '@latitude-data/core/services/documentTriggers/triggerEvents/getDocumentTriggerRunParameters'
import { DocumentTriggerEventItem } from './TriggerEvent'
import {
  DocumentTrigger,
  DocumentTriggerEvent,
  DocumentVersion,
} from '@latitude-data/core/schema/types'

const LOADING_BLOCKS = Array.from({ length: 3 })

function LoadingTriggerEvents() {
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

export function TriggerEventsList({
  trigger,
  document,
  onRunTrigger,
  emptyState,
}: {
  trigger: DocumentTrigger
  document: DocumentVersion
  onRunTrigger: OnRunTriggerFn
  emptyState: ReactNode
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
      onRunTrigger({ document, parameters: parameters ?? {} })
    },
    [onRunTrigger, document, trigger],
  )

  if (isLoading) {
    return <LoadingTriggerEvents />
  }

  if (triggerEvents.length === 0) {
    return emptyState
  }

  return (
    <ul className='divide-y divede-border max-h-80 overflow-y-auto custom-scrollbar scrollable-indicator'>
      {triggerEvents.map((event) => (
        <li key={event.id}>
          <DocumentTriggerEventItem
            event={event}
            handleRunTrigger={handleRunTrigger}
          />
        </li>
      ))}
    </ul>
  )
}
