import { touchApiKey } from '../../services/apiKeys/touch'
import { EventHandler, ProviderLogCreatedEvent } from '../events'

export const touchApiKeyJob: EventHandler<ProviderLogCreatedEvent> = async ({
  data: event,
}: {
  data: ProviderLogCreatedEvent
}) => {
  const { data: providerLog } = event

  if (providerLog.apiKeyId) {
    await touchApiKey(providerLog.apiKeyId).then((r) => r.unwrap())
  }
}
