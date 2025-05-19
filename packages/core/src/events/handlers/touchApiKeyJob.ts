import { ProviderLogsRepository } from '../../repositories'
import { touchApiKey } from '../../services/apiKeys/touch'
import { EventHandler, ProviderLogCreatedEvent } from '../events'

export const touchApiKeyJob: EventHandler<ProviderLogCreatedEvent> = async ({
  data: event,
}: {
  data: ProviderLogCreatedEvent
}) => {
  const { id, workspaceId } = event.data
  const repo = new ProviderLogsRepository(workspaceId)
  const providerLog = await repo.find(id).then((r) => r.unwrap())

  if (providerLog.apiKeyId) {
    await touchApiKey(providerLog.apiKeyId).then((r) => r.unwrap())
  }
}
