import { touchApiKey } from '../../services/apiKeys/touch'
import { EventHandler, ProviderLogCreatedEvent } from '../events'
import { bufferOperation } from '../../utils/bufferOperation'

const BUFFER_TIME_SECONDS = 5

export const touchApiKeyJob: EventHandler<ProviderLogCreatedEvent> = async ({
  data: event,
}: {
  data: ProviderLogCreatedEvent
}): Promise<void> => {
  const { apiKeyId } = event.data

  if (!apiKeyId) return

  const cacheKey = `touch_api_key:${apiKeyId}`

  await bufferOperation(
    cacheKey,
    () => touchApiKey(apiKeyId),
    BUFFER_TIME_SECONDS,
  )
}
