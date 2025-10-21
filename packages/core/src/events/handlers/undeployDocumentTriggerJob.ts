import { getPipedreamClient } from '../../services/integrations/pipedream/apps'
import { EventHandler } from '../events'
import { DocumentTriggerUndeployRequestedEvent } from '../events'
import { captureException } from '../../utils/workers/datadog'

export const undeployDocumentTriggerJob: EventHandler<
  DocumentTriggerUndeployRequestedEvent
> = async ({ data: event }) => {
  const { triggerId, externalUserId } = event.data
  const pipedream = getPipedreamClient().unwrap()

  try {
    await pipedream.deployedTriggers.delete(triggerId, {
      externalUserId,
    })
  } catch (error) {
    captureException(error as Error)
    throw error
  }
}
