import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { fakeResponse } from '../../../services/chains/ProviderProcessor'
import { writeConversationCache } from '../../../services/conversations/cache'

/**
 * When a assistant message is stopped by the user, cache the partial response to keep the message chain alive.
 **/
export async function createFakeProviderLog({
  documentLogUuid,
  accumulatedText,
  conversationContext,
  workspace,
  provider,
  messages,
}: {
  documentLogUuid: string
  accumulatedText: { text: string }
  conversationContext?: { commitUuid: string; documentUuid: string }
  workspace: Workspace
  provider: ProviderApiKey
  messages: LegacyMessage[]
}) {
  const response = await fakeResponse({
    documentLogUuid,
    accumulatedText,
  })
  if (!conversationContext) return

  await writeConversationCache({
    documentLogUuid,
    workspaceId: workspace.id,
    commitUuid: conversationContext.commitUuid,
    documentUuid: conversationContext.documentUuid,
    providerId: provider.id,
    messages: [...messages, ...(response.output ?? [])],
  }).then((r) => r.unwrap())
}
