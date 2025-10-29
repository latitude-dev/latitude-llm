import serializeProviderLog from '@latitude-data/core/services/providerLogs/serialize'
import { buildConversation } from '@latitude-data/core/helpers'
import { HydratedProviderLog } from '@latitude-data/core/schema/models/types/ProviderLog'
import { LatitudeError } from '@latitude-data/constants/errors'

/**
 * Transforms a hydrated provider log into a conversation format for API responses.
 */
export function conversationPresenter(
  lastHydratedProviderLog: HydratedProviderLog,
) {
  const conversationUuid = lastHydratedProviderLog.documentLogUuid
  if (!conversationUuid) {
    throw new LatitudeError(
      'Provider log must have a documentLogUuid to create a conversation',
    )
  }

  const serializedProviderLog = serializeProviderLog(lastHydratedProviderLog)
  const conversation = buildConversation(serializedProviderLog)

  return {
    uuid: conversationUuid,
    conversation,
  }
}
