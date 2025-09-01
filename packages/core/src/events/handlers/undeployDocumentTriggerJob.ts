import { getPipedreamEnvironment } from '../../services/integrations/pipedream/apps'
import { createBackendClient } from '@pipedream/sdk'
import { EventHandler } from '../events'
import { DocumentTriggerUndeployRequestedEvent } from '../events'
import { captureException } from '../../utils/workers/sentry'

export const undeployDocumentTriggerJob: EventHandler<
  DocumentTriggerUndeployRequestedEvent
> = async ({ data: event }) => {
  const { triggerId, externalUserId } = event.data

  const pipedreamEnv = getPipedreamEnvironment()
  if (!pipedreamEnv.ok) {
    console.error(
      `Pipedream environment not configured: ${pipedreamEnv.error?.message}`,
    )
    return
  }

  const pipedream = createBackendClient(pipedreamEnv.unwrap())

  try {
    await pipedream.deleteTrigger({
      id: triggerId,
      externalUserId,
    })
  } catch (error) {
    captureException(error as Error)
    throw error
  }
}
