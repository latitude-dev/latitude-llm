import { getPipedreamClient } from '../../services/integrations/pipedream/apps'
import { EventHandler } from '../events'
import { DocumentTriggerUndeployRequestedEvent } from '../events'

export const undeployDocumentTriggerJob: EventHandler<
  DocumentTriggerUndeployRequestedEvent
> = async ({ data: event }) => {
  const { triggerId, externalUserId } = event.data
  const pipedream = getPipedreamClient().unwrap()

  await pipedream.deployedTriggers.delete(triggerId, { externalUserId })
}
