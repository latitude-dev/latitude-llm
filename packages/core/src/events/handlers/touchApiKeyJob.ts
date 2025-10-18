import { ProviderLogsRepository } from '../../repositories'
import { touchApiKey } from '../../services/apiKeys/touch'
import { EventHandler, ProviderLogCreatedEvent } from '../events'
import { bufferOperation } from '../../utils/bufferOperation'

// Buffer time in seconds before allowing another touch to the same API key
const BUFFER_TIME_SECONDS = 5

export const touchApiKeyJob: EventHandler<ProviderLogCreatedEvent> = async ({
  data: event,
}: {
  data: ProviderLogCreatedEvent
}): Promise<void> => {
  const { id, workspaceId } = event.data
  const repo = new ProviderLogsRepository(workspaceId)
  let providerLog
  try {
    providerLog = await repo.find(id).then((r) => r.unwrap())
  } catch (_error) {
    // do nothing, we don't wanna retry the job
    return
  }

  if (providerLog.apiKeyId) {
    const apiKeyId = providerLog.apiKeyId
    const cacheKey = `touch_api_key:${apiKeyId}`

    await bufferOperation(
      cacheKey,
      () => touchApiKey(apiKeyId),
      BUFFER_TIME_SECONDS,
    )
  }
}
