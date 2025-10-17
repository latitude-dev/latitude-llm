import { useMemo } from 'react'
import { DefaultTriggerEvent } from './Default'
import { DocumentTriggerType } from '@latitude-data/constants'
import { EmailTriggerEvent } from './Email'
import { IntegrationTriggerEvent } from './Integration'
import { DocumentTriggerEvent } from '@latitude-data/core/schema/models/types/DocumentTriggerEvent'

export function DocumentTriggerEventItem<T extends DocumentTriggerType>({
  event,
  handleRunEvent,
  isNew,
}: {
  event: DocumentTriggerEvent<T>
  handleRunEvent: (event: DocumentTriggerEvent<T>) => () => void
  isNew: boolean
}) {
  const handleRun = useMemo(
    () => handleRunEvent(event),
    [handleRunEvent, event],
  )

  if (event.triggerType === DocumentTriggerType.Email) {
    return (
      <EmailTriggerEvent
        event={event as DocumentTriggerEvent<DocumentTriggerType.Email>}
        handleRunTrigger={handleRun}
        isNew={isNew}
      />
    )
  }

  if (event.triggerType === DocumentTriggerType.Integration) {
    return (
      <IntegrationTriggerEvent
        event={event as DocumentTriggerEvent<DocumentTriggerType.Integration>}
        handleRunTrigger={handleRun}
        isNew={isNew}
      />
    )
  }

  return (
    <DefaultTriggerEvent
      event={event}
      handleRunTrigger={handleRun}
      isNew={isNew}
    />
  )
}
