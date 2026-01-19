import { EventHandler, ProviderLogCreatedEvent } from '../events'
import { touchProviderApiKey } from '../../services/providerApiKeys/touch'
import { bufferOperation } from '../../utils/bufferOperation'

const BUFFER_TIME_SECONDS = 5

export const touchProviderApiKeyJob: EventHandler<
  ProviderLogCreatedEvent
> = async ({ data: event }) => {
  const { providerId } = event.data

  if (!providerId) return

  const cacheKey = `touch_provider_api_key:${providerId}`

  await bufferOperation(
    cacheKey,
    () => touchProviderApiKey(providerId),
    BUFFER_TIME_SECONDS,
  )
}
