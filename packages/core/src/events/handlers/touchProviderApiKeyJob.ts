import { ProviderLogsRepository } from '../../repositories'
import { touchProviderApiKey } from '../../services/providerApiKeys/touch'
import { EventHandler, ProviderLogCreatedEvent } from '../events'

export const touchProviderApiKeyJob: EventHandler<
  ProviderLogCreatedEvent
> = async ({ data: event }: { data: ProviderLogCreatedEvent }) => {
  const { id, workspaceId } = event.data
  const repo = new ProviderLogsRepository(workspaceId)
  const providerLog = await repo.find(id).then((r) => r.unwrap())

  if (providerLog.providerId) {
    await touchProviderApiKey(providerLog.providerId).then((r) => r.unwrap())
  }
}
