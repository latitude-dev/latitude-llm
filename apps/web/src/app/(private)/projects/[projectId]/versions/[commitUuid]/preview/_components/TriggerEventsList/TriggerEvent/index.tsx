import { useMemo } from 'react'
import { DefaultTriggerEvent } from './Default'
import { DocumentTriggerType } from '@latitude-data/constants'
import { EmailTriggerEvent } from './Email'
import { IntegrationTriggerEvent } from './Integration'
import { DocumentTriggerEvent } from '@latitude-data/core/schema/types'

export function DocumentTriggerEventItem<T extends DocumentTriggerType>({
  event,
  handleRunTrigger,
}: {
  event: DocumentTriggerEvent<T>
  handleRunTrigger: (event: DocumentTriggerEvent<T>) => () => void
}) {
  const handleRun = useMemo(
    () => handleRunTrigger(event),
    [handleRunTrigger, event],
  )

  if (event.triggerType === DocumentTriggerType.Email) {
    return (
      <EmailTriggerEvent
        event={event as DocumentTriggerEvent<DocumentTriggerType.Email>}
        handleRunTrigger={handleRun}
      />
    )
  }

  if (event.triggerType === DocumentTriggerType.Integration) {
    return (
      <IntegrationTriggerEvent
        event={event as DocumentTriggerEvent<DocumentTriggerType.Integration>}
        handleRunTrigger={handleRun}
      />
    )
  }

  return <DefaultTriggerEvent event={event} handleRunTrigger={handleRun} />
}
