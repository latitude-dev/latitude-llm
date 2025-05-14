import { touchProviderApiKey } from '../../services/providerApiKeys/touch'
import { EventHandler, ProviderLogCreatedEvent } from '../events'

export const touchProviderApiKeyJob: EventHandler<
  ProviderLogCreatedEvent
> = async ({ data: event }: { data: ProviderLogCreatedEvent }) => {
  const { data: providerLog } = event

  if (providerLog.providerId) {
    await touchProviderApiKey(providerLog.providerId).then((r) => r.unwrap())
  }
}
