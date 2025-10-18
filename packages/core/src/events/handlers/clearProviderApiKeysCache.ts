import { cache } from '../../cache'
import {
  EventHandler,
  ProviderApiKeyCreatedEvent,
  ProviderApiKeyDestroyedEvent,
  ProviderApiKeyUpdatedEvent,
} from '../events'

const clearProviderApiKeysCache: EventHandler<
  | ProviderApiKeyCreatedEvent
  | ProviderApiKeyDestroyedEvent
  | ProviderApiKeyUpdatedEvent
> = async ({ data: event }) => {
  try {
    const cacheClient = await cache()
    await cacheClient.del(
      `workspace:${event.data.workspaceId}:provider-api-keys-map`,
    )
  } catch (_error) {
    // Ignore cache errors
  }
}

export { clearProviderApiKeysCache }
