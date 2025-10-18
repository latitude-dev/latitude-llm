import { ProviderLogsRepository } from '../../repositories'
import { EventHandler, ProviderLogCreatedEvent } from '../events'
import { touchProviderApiKey } from '../../services/providerApiKeys/touch'
import { bufferOperation } from '../../utils/bufferOperation'

// Buffer time in seconds before allowing another touch to the same provider API key
const BUFFER_TIME_SECONDS = 5

export const touchProviderApiKeyJob: EventHandler<
  ProviderLogCreatedEvent
> = async ({ data: event }) => {
  const { id, workspaceId } = event.data
  const repo = new ProviderLogsRepository(workspaceId)
  let providerLog
  try {
    providerLog = await repo.find(id).then((r) => r.unwrap())
  } catch (_error) {
    // do nothing, we don't wanna retry the job
    return
  }

  if (!providerLog.providerId) return

  const providerId = providerLog.providerId
  const cacheKey = `touch_provider_api_key:${providerId}`

  await bufferOperation(
    cacheKey,
    () => touchProviderApiKey(providerId),
    BUFFER_TIME_SECONDS,
  )
}
